import { describe, expect, it } from 'vitest'
import type { SqlRow } from '@lib/database/db'
import { decodeCursor } from '@lib/search/cursor'
import { buildSearchQuery, toSearchPage } from '@lib/search/search-query'

const SAMPLE_TRADED_AT = '2026-11-07T14:30:05.100Z'
const NAMED_PARAMETER = /(?<!:):(\w+)/g

const dbRow = (id: number): SqlRow => ({
  id,
  account: '1234',
  advisor: 'JD1',
  symbol: 'AAPL',
  traded_at_ms: Date.parse(SAMPLE_TRADED_AT),
  side: 'B',
  qty: 10,
  price: '134.3000',
  notes: null,
})

describe('buildSearchQuery', () => {
  it('selects the newest trades when there are no filters', () => {
    const { sql, params } = buildSearchQuery({ limit: 50 })

    expect(sql).not.toContain('where')
    expect(sql).toContain('order by traded_at desc, id desc')
    expect(params).toEqual({ limit: 51 })
  })

  it('adds one condition per filter', () => {
    const { sql, params } = buildSearchQuery({
      account: '1234',
      advisor: 'JD1',
      symbol: 'AAPL',
      side: 'S',
      from: '2026-11-07T09:30:00-05:00',
      to: '2026-11-07T16:00:00Z',
      qtyMin: 5,
      qtyMax: 50,
      priceMin: '100',
      priceMax: '200',
      keyword: 'rebalance',
      limit: 10,
    })

    for (const condition of [
      'account = :account::text',
      'advisor = :advisor::text',
      'symbol = :symbol::text',
      'side = :side::text',
      'traded_at >= :from::timestamptz',
      'traded_at <= :to::timestamptz',
      'qty >= :qtyMin::integer',
      'qty <= :qtyMax::integer',
      'price >= :priceMin::numeric',
      'price <= :priceMax::numeric',
      "notes_tsv @@ websearch_to_tsquery('english', :keyword::text)",
    ]) {
      expect(sql).toContain(condition)
    }
    expect(params).toEqual({
      account: '1234',
      advisor: 'JD1',
      symbol: 'AAPL',
      side: 'S',
      from: '2026-11-07T09:30:00-05:00',
      to: '2026-11-07T16:00:00Z',
      qtyMin: 5,
      qtyMax: 50,
      priceMin: '100',
      priceMax: '200',
      keyword: 'rebalance',
      limit: 11,
    })
  })

  it('continues after the cursor', () => {
    const { sql, params } = buildSearchQuery({
      limit: 10,
      cursor: { tradedAt: SAMPLE_TRADED_AT, id: 9 },
    })

    expect(sql).toContain('(traded_at, id) < (:cursorTradedAt::timestamptz, :cursorId::bigint)')
    expect(params).toEqual({ cursorTradedAt: SAMPLE_TRADED_AT, cursorId: 9, limit: 11 })
  })

  it('binds every parameter it uses, each with an explicit cast', () => {
    const { sql, params } = buildSearchQuery({
      account: '1234',
      side: 'B',
      from: '2026-11-07T09:30:00-05:00',
      qtyMin: 1,
      priceMax: '200',
      keyword: 'rebalance',
      limit: 5,
      cursor: { tradedAt: SAMPLE_TRADED_AT, id: 9 },
    })
    const placeholders = [...sql.matchAll(NAMED_PARAMETER)]

    expect(placeholders.map(([, name]) => name).toSorted()).toEqual(Object.keys(params).toSorted())
    for (const placeholder of placeholders) {
      expect(sql.slice(placeholder.index + placeholder[0].length)).toMatch(/^::/)
    }
  })
})

describe('toSearchPage', () => {
  it('maps rows and returns a cursor when another page exists', () => {
    const page = toSearchPage([dbRow(3), dbRow(2), dbRow(1)], 2)

    expect(page.items.map((item) => item.id)).toEqual([3, 2])
    expect(page.items[0]).toEqual({
      id: 3,
      account: '1234',
      advisor: 'JD1',
      symbol: 'AAPL',
      tradedAt: SAMPLE_TRADED_AT,
      side: 'B',
      qty: 10,
      price: '134.3000',
      notes: null,
    })
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({ tradedAt: SAMPLE_TRADED_AT, id: 2 })
  })

  it('returns no cursor on the last page', () => {
    expect(toSearchPage([dbRow(1)], 2).nextCursor).toBeNull()
  })

  it('reads a note the record leaves out as null', () => {
    const row = dbRow(1)
    delete row.notes

    expect(toSearchPage([row], 1).items[0].notes).toBeNull()
  })
})
