import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { decodeCursor, type Cursor } from '@lib/search/cursor'
import type { SearchParams } from '@lib/search/search-params'
import { searchTrades } from '@lib/search/search-query'
import { seedTrades } from '../support/seed'
import { connectTestDb } from '../support/test-db'

const { db, reset, close } = connectTestDb()

beforeEach(async () => {
  await reset()
  await seedTrades(db, [
    {
      account: '1234',
      symbol: 'AAPL',
      side: 'B',
      qty: 10,
      price: '134.30',
      tradedAt: '2026-11-07T14:30:00.000Z',
      notes: 'Brian asked for AAPL in his portfolio OR REBALANCE',
    },
    {
      account: '1234',
      symbol: 'MSFT',
      side: 'S',
      qty: 5,
      price: '410.00',
      tradedAt: '2026-11-07T15:00:00.000Z',
      notes: 'Rebalances toward cash',
    },
    {
      account: '5678',
      advisor: 'AB2',
      symbol: 'AAPL',
      side: 'S',
      qty: 200,
      price: '135.00',
      tradedAt: '2026-11-07T16:00:00.000Z',
      notes: 'Tax-loss harvest',
    },
  ])
})
afterAll(close)

const search = (filters: Partial<SearchParams> = {}) => searchTrades(db, { limit: 50, ...filters })

const accountSymbols = async (filters: Partial<SearchParams>) =>
  (await search(filters)).items.map((trade) => `${trade.account}:${trade.symbol}`)

const positionAfter = (nextCursor: string | null): Cursor => {
  const cursor = nextCursor === null ? null : decodeCursor(nextCursor)
  expect(cursor).not.toBeNull()
  return cursor as Cursor
}

describe('searchTrades', () => {
  it('returns the newest trades first when there are no filters', async () => {
    expect(await accountSymbols({})).toEqual(['5678:AAPL', '1234:MSFT', '1234:AAPL'])
  })

  it('filters by exact account and side', async () => {
    expect(await accountSymbols({ account: '1234', side: 'S' })).toEqual(['1234:MSFT'])
  })

  it('filters by advisor and symbol', async () => {
    expect(await accountSymbols({ advisor: 'AB2', symbol: 'AAPL' })).toEqual(['5678:AAPL'])
  })

  it('filters by quantity range', async () => {
    expect(await accountSymbols({ qtyMin: 6, qtyMax: 100 })).toEqual(['1234:AAPL'])
  })

  it('filters by an inclusive price range', async () => {
    expect(await accountSymbols({ priceMin: '135', priceMax: '410' })).toEqual([
      '5678:AAPL',
      '1234:MSFT',
    ])
  })

  it('filters by an inclusive time range given with any offset', async () => {
    const result = await accountSymbols({
      from: '2026-11-07T10:00:00-05:00',
      to: '2026-11-07T16:00:00Z',
    })

    expect(result).toEqual(['5678:AAPL', '1234:MSFT'])
  })

  it('matches keywords by stem, ignoring case', async () => {
    expect(await accountSymbols({ keyword: 'rebalance' })).toEqual(['1234:MSFT', '1234:AAPL'])
  })

  it('supports OR and exclusion', async () => {
    expect(await accountSymbols({ keyword: 'harvest OR brian' })).toEqual([
      '5678:AAPL',
      '1234:AAPL',
    ])
    expect(await accountSymbols({ keyword: 'rebalance -cash' })).toEqual(['1234:AAPL'])
  })

  it('matches quoted phrases in order', async () => {
    expect(await accountSymbols({ keyword: '"tax loss"' })).toEqual(['5678:AAPL'])
    expect(await accountSymbols({ keyword: '"loss tax"' })).toEqual([])
  })

  it('returns trades in the API shape', async () => {
    const { items } = await search({ symbol: 'MSFT' })

    expect(items).toEqual([
      {
        id: expect.any(Number),
        account: '1234',
        advisor: 'JD1',
        symbol: 'MSFT',
        tradedAt: '2026-11-07T15:00:00.000Z',
        side: 'S',
        qty: 5,
        price: '410.0000',
        notes: 'Rebalances toward cash',
      },
    ])
  })

  it('pages through every trade exactly once', async () => {
    const seen: number[] = []
    let page = await search({ limit: 1 })
    seen.push(...page.items.map((trade) => trade.id))

    while (page.nextCursor) {
      page = await search({ limit: 1, cursor: positionAfter(page.nextCursor) })
      seen.push(...page.items.map((trade) => trade.id))
    }

    expect(seen).toHaveLength(3)
    expect(new Set(seen).size).toBe(3)
  })

  it('breaks ties on identical times by id', async () => {
    await reset()
    await seedTrades(db, [{ notes: 'a' }, { notes: 'b' }, { notes: 'c' }])

    const first = await search({ limit: 2 })
    const second = await search({ limit: 2, cursor: positionAfter(first.nextCursor) })

    expect([...first.items, ...second.items].map((trade) => trade.notes)).toEqual(['c', 'b', 'a'])
    expect(second.nextCursor).toBeNull()
  })
})
