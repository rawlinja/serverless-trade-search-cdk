import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { completeRun, failRun, findRuns, recordRejectedReport, startRun } from '@lib/ingest/runs'
import { connectTestDb } from '../support/test-db'

const REPORT_KEY = 'reports/2026-11-07/robinhood-0930.csv'
const { db, pool, reset, close } = connectTestDb()

beforeEach(reset)
afterAll(close)

const readRun = async (id: number) =>
  (await pool.query('select * from ingestion_runs where id = $1', [id])).rows[0]

describe('ingestion runs', () => {
  it('reuses the run for the same report version and counts attempts', async () => {
    const first = await startRun(db, REPORT_KEY, 'etag-1')
    const second = await startRun(db, REPORT_KEY, 'etag-1')

    expect(second).toBe(first)
    expect(await readRun(first)).toMatchObject({ status: 'processing', attempts: 2 })
  })

  it('records completion with rejected lines', async () => {
    const id = await startRun(db, REPORT_KEY, 'etag-1')
    await completeRun(db, id, 1, [{ line: 3, message: 'invalid side "X"' }])

    const run = await readRun(id)
    expect(run).toMatchObject({
      status: 'succeeded',
      rows_rejected: 1,
      errors: [{ line: 3, message: 'invalid side "X"' }],
    })
    expect(run.finished_at).not.toBeNull()
  })

  it('records a failure message', async () => {
    const id = await startRun(db, REPORT_KEY, 'etag-1')
    await failRun(db, id, 'Error: boom')

    expect(await readRun(id)).toMatchObject({
      status: 'failed',
      errors: [{ message: 'Error: boom' }],
    })
  })

  it('records a rejected report that never started', async () => {
    await recordRejectedReport(db, REPORT_KEY, 'etag-2', 'object overwritten')
    const [run] = await findRuns(db, REPORT_KEY)

    expect(run).toMatchObject({ etag: 'etag-2', status: 'failed', tradesIngested: 0 })
  })

  it('lists the runs for a key with numeric ids', async () => {
    const id = await startRun(db, REPORT_KEY, 'etag-1')

    expect(await findRuns(db, REPORT_KEY)).toEqual([
      { id, etag: 'etag-1', status: 'processing', tradesIngested: 0 },
    ])
  })
})
