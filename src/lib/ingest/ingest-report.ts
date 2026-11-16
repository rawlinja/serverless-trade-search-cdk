import type { Readable } from 'node:stream'
import type { Db } from '@lib/database/db'
import type { RejectedLine, ReportLine } from '@lib/trades/trade'
import type { ParsedLine } from './parse-line'
import { readReportLines } from './read-report-lines'
import {
  completeRun,
  failRun,
  findRuns,
  recordRejectedReport,
  startRun,
  type RunSummary,
} from './runs'
import type { ReportRef } from './s3-event'
import { saveTrades } from './save-trades'
import { tradeDateFromKey } from './trade-time'

export const BATCH_SIZE = 500
export const MAX_REPORT_BYTES = 50 * 1024 * 1024
const MAX_KEPT_ERRORS = 20

export type OpenedReport = { body: Readable; sizeBytes: number }
export type IngestDeps = { db: Db; openReport: (ref: ReportRef) => Promise<OpenedReport> }
export type IngestOutcome = 'succeeded' | 'skipped' | 'dropped'

type LoadSummary = { rejected: number; errors: RejectedLine[] }

export async function ingestReport(deps: IngestDeps, ref: ReportRef): Promise<IngestOutcome> {
  const { db } = deps
  const runs = await findRuns(db, ref.key)

  if (runs.some((run) => run.etag === ref.etag && run.status === 'succeeded')) return 'skipped'
  if (runs.some((run) => run.etag !== ref.etag && hasLoadedTrades(run))) {
    return dropReport(db, ref, 'object overwritten')
  }

  const tradeDate = tradeDateFromKey(ref.key)
  if (!tradeDate) return dropReport(db, ref, 'key has no YYYY-MM-DD date')

  const runId = await startRun(db, ref.key, ref.etag)
  try {
    return await loadReport(deps, ref, runId, tradeDate)
  } catch (error) {
    await failRun(db, runId, String(error)).catch(() => undefined)
    throw error
  }
}

function hasLoadedTrades(run: RunSummary): boolean {
  return run.status === 'succeeded' || run.tradesIngested > 0
}

async function dropReport(db: Db, ref: ReportRef, reason: string): Promise<IngestOutcome> {
  await recordRejectedReport(db, ref.key, ref.etag, reason)
  return 'dropped'
}

async function loadReport(
  { db, openReport }: IngestDeps,
  ref: ReportRef,
  runId: number,
  tradeDate: string,
): Promise<IngestOutcome> {
  const report = await openReport(ref)
  if (report.sizeBytes > MAX_REPORT_BYTES) {
    report.body.destroy()
    await failRun(db, runId, 'file too large')
    return 'dropped'
  }

  const { rejected, errors } = await saveReportLines(
    db,
    runId,
    readReportLines(report.body, tradeDate),
  )
  await completeRun(db, runId, rejected, errors)
  return 'succeeded'
}

async function saveReportLines(
  db: Db,
  runId: number,
  lines: AsyncIterable<ParsedLine>,
): Promise<LoadSummary> {
  let chunk: ReportLine[] = []
  let rejected = 0
  const errors: RejectedLine[] = []

  for await (const result of lines) {
    if (!result.ok) {
      rejected += 1
      if (errors.length < MAX_KEPT_ERRORS) errors.push(result.error)
      continue
    }

    chunk.push({ line: result.line, trade: result.trade })
    if (chunk.length === BATCH_SIZE) {
      await saveTrades(db, runId, chunk)
      chunk = []
    }
  }

  if (chunk.length > 0) await saveTrades(db, runId, chunk)
  return { rejected, errors }
}
