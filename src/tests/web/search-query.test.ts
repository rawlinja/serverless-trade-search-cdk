import { describe, expect, it } from 'vitest'
import { formatNewYorkTime, toNewYorkInstant, toQueryString } from '../../../web/search-query.js'

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

describe('formatNewYorkTime', () => {
  it.each([
    { instant: '2026-11-07T14:30:05.100Z', shown: '2026-11-07 09:30:05.100' },
    { instant: '2026-07-01T13:30:00.000Z', shown: '2026-07-01 09:30:00.000' },
    { instant: '2026-11-07T05:00:00.000Z', shown: '2026-11-07 00:00:00.000' },
  ])('shows $instant as $shown', ({ instant, shown }) => {
    expect(formatNewYorkTime(instant)).toBe(shown)
  })
})
