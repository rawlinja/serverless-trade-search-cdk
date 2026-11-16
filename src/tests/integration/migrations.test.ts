import { afterAll, describe, expect, it } from 'vitest'
import { runMigrations } from '@lib/migrate/run-migrations'
import { connectTestDb } from '../support/test-db'

const { db, pool, reset, close } = connectTestDb()

afterAll(async () => {
  await reset()
  await close()
})

const insertTrade = (side: string, notes: string | null) =>
  pool.query(
    `insert into trading_activity_reports (account, advisor, symbol, traded_at, side, qty, price, notes)
     values ('1234', 'JD1', 'AAPL', now(), $1, 1, 1, $2)
     returning notes_tsv @@ websearch_to_tsquery('english', 'portfolios') as matches_keyword`,
    [side, notes],
  )

describe('migrations', () => {
  it('applies nothing when the schema is already current', async () => {
    expect(await runMigrations(db)).toEqual([])
  })

  it('rejects a side other than B or S', async () => {
    await expect(insertTrade('X', null)).rejects.toThrow(/side_check/)
  })

  it('derives a stemmed search vector from notes', async () => {
    const { rows } = await insertTrade('B', 'REBALANCE the portfolio')

    expect(rows[0].matches_keyword).toBe(true)
  })
})
