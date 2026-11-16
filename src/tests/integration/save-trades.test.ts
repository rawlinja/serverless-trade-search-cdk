import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { startRun } from '@lib/ingest/runs'
import { saveTrades } from '@lib/ingest/save-trades'
import type { ReportLine } from '@lib/trades/trade'
import { connectTestDb } from '../support/test-db'

const REPORT_KEY = 'reports/2026-11-07/robinhood-0930.csv'
const { db, pool, reset, close } = connectTestDb()

beforeEach(reset)
afterAll(close)

const reportLine = (line: number): ReportLine => ({
  line,
  trade: {
    account: '1234',
    advisor: 'JD1',
    symbol: 'AAPL',
    tradedAt: '2026-11-07T14:30:05.100Z',
    side: 'B',
    qty: 10,
    price: '134.30',
    notes: `line ${line}`,
  },
})

const lines = (first: number, last: number) =>
  [...Array(last - first + 1).keys()].map((offset) => reportLine(first + offset))

const countTrades = async () =>
  Number((await pool.query('select count(*) from trading_activity_reports')).rows[0].count)

const tradesIngested = async (runId: number) =>
  (await pool.query('select rows_ingested from ingestion_runs where id = $1', [runId])).rows[0]
    .rows_ingested

describe('saveTrades', () => {
  it('inserts each line and links it to its trade', async () => {
    const runId = await startRun(db, REPORT_KEY, 'etag-1')
    await saveTrades(db, runId, lines(1, 2))

    const { rows: links } = await pool.query(
      `select l.source_line, t.notes
       from ingested_lines l join trading_activity_reports t on t.id = l.trade_id
       where l.run_id = $1 order by l.source_line`,
      [runId],
    )
    expect(links).toEqual([
      { source_line: 1, notes: 'line 1' },
      { source_line: 2, notes: 'line 2' },
    ])
    expect(await tradesIngested(runId)).toBe(2)
  })

  it('inserts nothing when the same chunk is saved again', async () => {
    const runId = await startRun(db, REPORT_KEY, 'etag-1')
    await saveTrades(db, runId, lines(1, 2))
    await saveTrades(db, runId, lines(1, 2))

    expect(await countTrades()).toBe(2)
    expect(await tradesIngested(runId)).toBe(2)
  })

  it('resumes a partly saved report without duplicating lines', async () => {
    const runId = await startRun(db, REPORT_KEY, 'etag-1')
    await saveTrades(db, runId, lines(1, 2))
    await saveTrades(db, runId, lines(1, 4))

    expect(await countTrades()).toBe(4)
    expect(await tradesIngested(runId)).toBe(4)
  })

  it('inserts each line once when the same chunk is saved concurrently', async () => {
    const runId = await startRun(db, REPORT_KEY, 'etag-1')
    await Promise.all([saveTrades(db, runId, lines(1, 3)), saveTrades(db, runId, lines(1, 3))])

    expect(await countTrades()).toBe(3)
    expect(await tradesIngested(runId)).toBe(3)
  })

  it('stores the trade time and price exactly', async () => {
    const runId = await startRun(db, REPORT_KEY, 'etag-1')
    await saveTrades(db, runId, lines(1, 1))

    const { rows: stored } = await pool.query(
      `select price::text as price, traded_at = '2026-11-07T14:30:05.100Z'::timestamptz as same_time
       from trading_activity_reports`,
    )
    expect(stored).toEqual([{ price: '134.3000', same_time: true }])
  })
})
