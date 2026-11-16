import { describe, expect, it } from 'vitest'
import { toTradedAt, tradeDateFromKey } from '@lib/ingest/trade-time'

describe('tradeDateFromKey', () => {
  it('reads the date folder from the key', () => {
    expect(tradeDateFromKey('reports/2026-11-07/robinhood-0930.csv')).toBe('2026-11-07')
  })

  it('returns null when the key has no date folder', () => {
    expect(tradeDateFromKey('reports/robinhood-0930.csv')).toBeNull()
  })

  it('returns null for an impossible date', () => {
    expect(tradeDateFromKey('reports/2026-02-30/a.csv')).toBeNull()
  })
})

describe('toTradedAt', () => {
  it('converts a winter New York time to UTC', () => {
    expect(toTradedAt('2026-11-07', '09:30:05.100')).toBe('2026-11-07T14:30:05.100Z')
  })

  it('converts a summer New York time to UTC', () => {
    expect(toTradedAt('2026-07-01', '09:30:00')).toBe('2026-07-01T13:30:00.000Z')
  })

  it('converts both sides of the spring-forward change and rejects the skipped hour', () => {
    expect(toTradedAt('2026-03-08', '01:30:00')).toBe('2026-03-08T06:30:00.000Z')
    expect(toTradedAt('2026-03-08', '03:30:00')).toBe('2026-03-08T07:30:00.000Z')
    expect(toTradedAt('2026-03-08', '02:30:00')).toBeNull()
  })

  it('takes the earlier instant for a time repeated by the fall-back change', () => {
    expect(toTradedAt('2026-11-01', '01:30:00')).toBe('2026-11-01T05:30:00.000Z')
  })

  it('pads short fractional seconds', () => {
    expect(toTradedAt('2026-11-07', '09:30:05.1')).toBe('2026-11-07T14:30:05.100Z')
  })

  it.each(['9:30:05', '24:00:00', '09:60:00', '09:30:60', '09:30', 'noon'])(
    'rejects %s',
    (time) => {
      expect(toTradedAt('2026-11-07', time)).toBeNull()
    },
  )
})
