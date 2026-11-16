import { Readable } from 'node:stream'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@lib/database/db'
import {
  BATCH_SIZE,
  ingestReport,
  MAX_REPORT_BYTES,
  type OpenedReport,
} from '@lib/ingest/ingest-report'
import type { ReportRef } from '@lib/ingest/s3-event'
import { connectTestDb } from '../support/test-db'

const { db, pool, reset, close } = connectTestDb()

beforeEach(reset)
afterAll(close)

const REPORT_REF: ReportRef = {
  bucket: 'reports-bucket',
  key: 'reports/2026-11-07/robinhood-0930.csv',
  etag: 'etag-1',
}
const VALID_LINE = '1234, JD1, AAPL, 09:30:05.100, B, 10, 134.30, "Brian asked for AAPL"\n'
const INVALID_LINE = '1234, JD1, AAPL, 09:30:05.100, X, 10, 134.30, "bad side"\n'

const failingSaves: Db = {
  execute: (sql, params) =>
    sql.includes('jsonb_to_recordset')
      ? Promise.reject(new Error('connection lost'))
      : db.execute(sql, params),
}

const openText =
  (text: string, sizeBytes = Buffer.byteLength(text)) =>
  async (): Promise<OpenedReport> => ({ body: Readable.from([text]), sizeBytes })

const ingestText = (text: string, ref = REPORT_REF, target: Db = db) =>
  ingestReport({ db: target, openReport: openText(text) }, ref)

const countTrades = async () =>
  Number((await pool.query('select count(*) from trading_activity_reports')).rows[0].count)

const readRun = async (etag: string) =>
  (await pool.query('select * from ingestion_runs where etag = $1', [etag])).rows[0]

describe('ingestReport', () => {
  it('saves valid lines, rejects invalid ones, and records the run', async () => {
    const outcome = await ingestText(VALID_LINE + INVALID_LINE + VALID_LINE)

    expect(outcome).toBe('succeeded')
    expect(await countTrades()).toBe(2)
    expect(await readRun('etag-1')).toMatchObject({
      status: 'succeeded',
      attempts: 1,
      rows_ingested: 2,
      rows_rejected: 1,
      errors: [{ line: 2, message: 'invalid side "X"' }],
    })
  })

  it('saves reports larger than one chunk', async () => {
    await ingestText(VALID_LINE.repeat(BATCH_SIZE + 1))

    expect(await countTrades()).toBe(BATCH_SIZE + 1)
    expect(await readRun('etag-1')).toMatchObject({ rows_ingested: BATCH_SIZE + 1 })
  })

  it('keeps only the first 20 line errors', async () => {
    await ingestText(INVALID_LINE.repeat(25))

    const run = await readRun('etag-1')
    expect(run).toMatchObject({ status: 'succeeded', rows_rejected: 25 })
    expect(run.errors).toHaveLength(20)
    expect(run.errors[0]).toEqual({ line: 1, message: 'invalid side "X"' })
  })

  it('skips a report version that already succeeded', async () => {
    await ingestText(VALID_LINE)

    expect(await ingestText(VALID_LINE)).toBe('skipped')
    expect(await countTrades()).toBe(1)
  })

  it('drops an overwritten report whose earlier version saved trades', async () => {
    await ingestText(VALID_LINE)

    const outcome = await ingestText(VALID_LINE, { ...REPORT_REF, etag: 'etag-2' })

    expect(outcome).toBe('dropped')
    expect(await readRun('etag-2')).toMatchObject({
      status: 'failed',
      errors: [{ message: 'object overwritten' }],
    })
  })

  it('ingests a replacement for a version that saved nothing', async () => {
    await expect(ingestText(VALID_LINE, REPORT_REF, failingSaves)).rejects.toThrow()
    expect(await readRun('etag-1')).toMatchObject({ status: 'failed', rows_ingested: 0 })

    const outcome = await ingestText(VALID_LINE, { ...REPORT_REF, etag: 'etag-2' })

    expect(outcome).toBe('succeeded')
  })

  it('drops a key without a trade date', async () => {
    const outcome = await ingestText(VALID_LINE, {
      ...REPORT_REF,
      key: 'reports/robinhood-0930.csv',
    })

    expect(outcome).toBe('dropped')
    expect(await readRun('etag-1')).toMatchObject({
      status: 'failed',
      errors: [{ message: 'key has no YYYY-MM-DD date' }],
    })
  })

  it('drops a report over the size limit', async () => {
    const openOversized = openText(VALID_LINE, MAX_REPORT_BYTES + 1)

    const outcome = await ingestReport({ db, openReport: openOversized }, REPORT_REF)

    expect(outcome).toBe('dropped')
    expect(await countTrades()).toBe(0)
    expect(await readRun('etag-1')).toMatchObject({
      status: 'failed',
      errors: [{ message: 'file too large' }],
    })
  })

  it('marks the run failed and rethrows when the report cannot be read', async () => {
    const openMissing = async (): Promise<OpenedReport> => {
      throw new Error('NoSuchKey')
    }

    await expect(ingestReport({ db, openReport: openMissing }, REPORT_REF)).rejects.toThrow(
      'NoSuchKey',
    )
    expect(await readRun('etag-1')).toMatchObject({
      status: 'failed',
      errors: [{ message: 'Error: NoSuchKey' }],
    })
  })

  it('marks the run failed and rethrows, then succeeds on retry', async () => {
    await expect(ingestText(VALID_LINE, REPORT_REF, failingSaves)).rejects.toThrow(
      'connection lost',
    )
    expect(await readRun('etag-1')).toMatchObject({ status: 'failed', attempts: 1 })

    await ingestText(VALID_LINE)

    expect(await readRun('etag-1')).toMatchObject({ status: 'succeeded', attempts: 2 })
    expect(await countTrades()).toBe(1)
  })
})
