import { describe, expect, it } from 'vitest'
import {
  exampleSearches,
  filterChips,
  toNewYorkInstant,
  toQueryString,
  toSearchFields,
} from '../../../web/search-query.js'

describe('toQueryString', () => {
  it('drops blank fields and trims values', () => {
    expect(toQueryString({ account: ' 1234 ', advisor: '', side: 'B' })).toBe('account=1234&side=B')
  })

  it('encodes keyword operators', () => {
    expect(toQueryString({ keyword: 'rebalance OR "tax loss" -cash' })).toBe(
      'keyword=rebalance+OR+%22tax+loss%22+-cash',
    )
  })

  it('appends the cursor for the next page', () => {
    expect(toQueryString({ symbol: 'AAPL' }, 'abc')).toBe('symbol=AAPL&cursor=abc')
  })
})

describe('toNewYorkInstant', () => {
  it('leaves an empty value empty', () => {
    expect(toNewYorkInstant('')).toBe('')
  })

  it.each([
    { when: 'in winter', local: '2026-11-07T09:30', instant: '2026-11-07T09:30:00-05:00' },
    { when: 'in summer', local: '2026-07-01T09:30:15', instant: '2026-07-01T09:30:15-04:00' },
    {
      when: 'after clocks spring forward',
      local: '2026-03-08T05:00',
      instant: '2026-03-08T05:00:00-04:00',
    },
    {
      when: 'after clocks fall back',
      local: '2026-11-01T05:00',
      instant: '2026-11-01T05:00:00-05:00',
    },
  ])('reads $local as New York time $when', ({ local, instant }) => {
    expect(toNewYorkInstant(local)).toBe(instant)
  })
})

describe('toSearchFields', () => {
  it('trims values, upper-cases the symbol and reads times as New York time', () => {
    expect(
      toSearchFields({
        symbol: ' tsla ',
        account: '1234 ',
        side: 'S',
        from: '2026-11-17T09:30',
        to: '',
      }),
    ).toEqual({
      symbol: 'TSLA',
      account: '1234',
      side: 'S',
      from: '2026-11-17T09:30:00-05:00',
      to: '',
    })
  })
})

describe('filterChips', () => {
  it('lists the filled-in fields with readable labels', () => {
    expect(
      filterChips({
        keyword: 'rebalance',
        symbol: 'TSLA',
        side: 'S',
        from: '2026-11-17T09:30',
        account: '',
      }),
    ).toEqual([
      { name: 'keyword', label: 'Keywords: rebalance' },
      { name: 'symbol', label: 'Symbol: TSLA' },
      { name: 'side', label: 'Side: Sell' },
      { name: 'from', label: 'From: 2026-11-17 09:30' },
    ])
  })
})

describe('exampleSearches', () => {
  it('offers four examples dated in New York', () => {
    const examples = exampleSearches(new Date('2026-11-18T03:00:00Z'))

    expect(examples).toEqual([
      { label: 'rebalance', form: { keyword: 'rebalance' } },
      { label: '"tax loss"', form: { keyword: '"tax loss"' } },
      {
        label: 'TSLA · Sells today',
        form: { symbol: 'TSLA', side: 'S', from: '2026-11-17T00:00' },
      },
      { label: 'Account 1234 · last 7 days', form: { account: '1234', from: '2026-11-11T00:00' } },
    ])
  })

  it('counts days back across a clock change', () => {
    const now = new Date('2026-11-07T04:30:00Z')

    expect(exampleSearches(now)[3].form.from).toBe('2026-10-31T00:00')
  })
})
