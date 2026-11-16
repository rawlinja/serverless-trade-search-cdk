import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@lib/search/cursor'
import { parseSearchParams } from '@lib/search/search-params'

const INSTANT_DETAIL = 'must be an ISO 8601 timestamp with a time zone'

describe('parseSearchParams', () => {
  it('applies the default limit when nothing is given', () => {
    expect(parseSearchParams({})).toEqual({ ok: true, params: { limit: 50 } })
  })

  it('reads every filter', () => {
    const cursor = { tradedAt: '2026-11-07T14:30:05.100Z', id: 7 }

    const result = parseSearchParams({
      account: '1234',
      advisor: 'JD1',
      symbol: 'AAPL',
      side: 'B',
      from: '2026-11-07T09:30:00-05:00',
      to: '2026-11-07T16:00:00Z',
      qty_min: '10',
      qty_max: '100',
      price_min: '100',
      price_max: '200.50',
      keyword: 'rebalance OR "tax loss"',
      limit: '25',
      cursor: encodeCursor(cursor),
    })

    expect(result).toEqual({
      ok: true,
      params: {
        account: '1234',
        advisor: 'JD1',
        symbol: 'AAPL',
        side: 'B',
        from: '2026-11-07T09:30:00-05:00',
        to: '2026-11-07T16:00:00Z',
        qtyMin: 10,
        qtyMax: 100,
        priceMin: '100',
        priceMax: '200.50',
        keyword: 'rebalance OR "tax loss"',
        limit: 25,
        cursor,
      },
    })
  })

  it('treats blank values as absent', () => {
    expect(parseSearchParams({ account: '  ', keyword: '' })).toEqual({
      ok: true,
      params: { limit: 50 },
    })
  })

  it('rejects unknown parameters', () => {
    expect(parseSearchParams({ acount: '1234' })).toEqual({
      ok: false,
      details: ['unknown parameter acount'],
    })
  })

  it.each([
    { name: 'side', value: 'X', detail: 'side must be B or S' },
    { name: 'qty_min', value: '1.5', detail: 'qty_min must be a whole number' },
    { name: 'qty_max', value: '99999999999', detail: 'qty_max must be at most 2147483647' },
    { name: 'price_max', value: 'abc', detail: 'price_max must be a decimal number' },
    { name: 'price_min', value: '.5', detail: 'price_min must be a decimal number' },
    { name: 'from', value: 'yesterday', detail: `from ${INSTANT_DETAIL}` },
    { name: 'from', value: '2026-11-07', detail: `from ${INSTANT_DETAIL}` },
    { name: 'to', value: '2026-02-30T00:00:00Z', detail: `to ${INSTANT_DETAIL}` },
    { name: 'to', value: '2026-11-07T09:30:00', detail: `to ${INSTANT_DETAIL}` },
    { name: 'limit', value: '0', detail: 'limit must be between 1 and 500' },
    { name: 'limit', value: '501', detail: 'limit must be between 1 and 500' },
    { name: 'limit', value: 'ten', detail: 'limit must be a whole number' },
    { name: 'cursor', value: 'garbage', detail: 'cursor is invalid' },
  ])('rejects $name=$value', ({ name, value, detail }) => {
    expect(parseSearchParams({ [name]: value })).toEqual({ ok: false, details: [detail] })
  })

  it('rejects a from after to', () => {
    const result = parseSearchParams({ from: '2026-11-08T00:00:00Z', to: '2026-11-07T00:00:00Z' })

    expect(result).toEqual({ ok: false, details: ['from must not be after to'] })
  })

  it('accepts a from equal to to, because the range is inclusive', () => {
    const result = parseSearchParams({
      from: '2026-11-07T10:00:00-05:00',
      to: '2026-11-07T15:00:00Z',
    })

    expect(result.ok).toBe(true)
  })

  it('rejects a keyword longer than 200 characters', () => {
    expect(parseSearchParams({ keyword: 'a'.repeat(201) })).toEqual({
      ok: false,
      details: ['keyword must be at most 200 characters'],
    })
  })

  it('reports every problem at once', () => {
    expect(parseSearchParams({ side: 'X', limit: '0', page: '2' })).toEqual({
      ok: false,
      details: ['unknown parameter page', 'side must be B or S', 'limit must be between 1 and 500'],
    })
  })
})
