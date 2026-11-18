import { describe, expect, it } from 'vitest'
import {
  formatPrice,
  formatQuantity,
  formatTradeTime,
  sideLabel,
} from '../../../web/trade-format.js'

describe('formatTradeTime', () => {
  it.each([
    { instant: '2026-11-17T20:57:32.780Z', time: '3:57:32 PM', date: 'Nov 17, 2026' },
    { instant: '2026-07-01T13:30:00.000Z', time: '9:30:00 AM', date: 'Jul 1, 2026' },
    { instant: '2026-11-18T03:00:00.000Z', time: '10:00:00 PM', date: 'Nov 17, 2026' },
  ])('shows $instant in New York time', ({ instant, time, date }) => {
    expect(formatTradeTime(instant)).toEqual({ time, date })
  })
})

describe('formatPrice', () => {
  it.each([
    { price: '311.8400', shown: '$311.84' },
    { price: '0.1234', shown: '$0.1234' },
    { price: '12345.6000', shown: '$12,345.60' },
    { price: '29.0700', shown: '$29.07' },
  ])('shows $price as $shown', ({ price, shown }) => {
    expect(formatPrice(price)).toBe(shown)
  })
})

describe('formatQuantity', () => {
  it('adds thousands separators', () => {
    expect(formatQuantity(1234567)).toBe('1,234,567')
  })
})

describe('sideLabel', () => {
  it('names each side', () => {
    expect([sideLabel('B'), sideLabel('S')]).toEqual(['Buy', 'Sell'])
  })
})
