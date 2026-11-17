import { randomUUID } from 'node:crypto'
import type { Db } from '@lib/database/db'
import { startRun } from '@lib/ingest/runs'
import { saveTrades } from '@lib/ingest/save-trades'
import type { Trade } from '@lib/trades/trade'

const SEED_REPORT_KEY = 'reports/2026-11-07/seed.csv'
const DEFAULT_TRADE: Trade = {
  account: '1234',
  advisor: 'JD1',
  symbol: 'AAPL',
  tradedAt: '2026-11-07T14:30:05.100Z',
  side: 'B',
  qty: 10,
  price: '134.30',
  notes: null,
}

export async function seedTrades(db: Db, trades: Partial<Trade>[]): Promise<void> {
  const runId = await startRun(db, SEED_REPORT_KEY, randomUUID())
  const lines = trades.map((trade, index) => ({
    line: index + 1,
    trade: { ...DEFAULT_TRADE, ...trade },
  }))
  await saveTrades(db, runId, lines)
}
