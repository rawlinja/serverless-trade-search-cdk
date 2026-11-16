import { describe, expect, it } from 'vitest'
import { parseLine } from '@lib/ingest/parse-line'

const VALID_FIELDS = [
  '1234',
  'JD1',
  'AAPL',
  '09:30:05.100',
  'B',
  '10',
  '134.30',
  'Brian asked for AAPL',
]

const withField = (index: number, value: string) =>
  VALID_FIELDS.map((field, position) => (position === index ? value : field))

describe('parseLine', () => {
  it('parses a valid line', () => {
    expect(parseLine(VALID_FIELDS, 1, '2026-11-07')).toEqual({
      ok: true,
      line: 1,
      trade: {
        account: '1234',
        advisor: 'JD1',
        symbol: 'AAPL',
        tradedAt: '2026-11-07T14:30:05.100Z',
        side: 'B',
        qty: 10,
        price: '134.30',
        notes: 'Brian asked for AAPL',
      },
    })
  })

  it('treats a missing or empty notes field as null', () => {
    const withoutNotes = parseLine(VALID_FIELDS.slice(0, 7), 1, '2026-11-07')
    const emptyNotes = parseLine(withField(7, ''), 1, '2026-11-07')

    expect(withoutNotes.ok && withoutNotes.trade.notes).toBeNull()
    expect(emptyNotes.ok && emptyNotes.trade.notes).toBeNull()
  })

  it.each([
    {
      problem: 'too few columns',
      fields: VALID_FIELDS.slice(0, 6),
      message: 'expected 8 columns (notes optional), got 6',
    },
    {
      problem: 'too many columns',
      fields: [...VALID_FIELDS, 'extra'],
      message: 'expected 8 columns (notes optional), got 9',
    },
    {
      problem: 'an empty account',
      fields: withField(0, ''),
      message: 'account, advisor and symbol are required',
    },
    { problem: 'a bad time', fields: withField(3, '9:30'), message: 'invalid time "9:30"' },
    { problem: 'a bad side', fields: withField(4, 'X'), message: 'invalid side "X"' },
    { problem: 'a zero qty', fields: withField(5, '0'), message: 'invalid qty "0"' },
    { problem: 'a fractional qty', fields: withField(5, '1.5'), message: 'invalid qty "1.5"' },
    {
      problem: 'a qty too large for the database',
      fields: withField(5, '2147483648'),
      message: 'invalid qty "2147483648"',
    },
    { problem: 'a negative price', fields: withField(6, '-1'), message: 'invalid price "-1"' },
    {
      problem: 'too many price decimals',
      fields: withField(6, '1.23456'),
      message: 'invalid price "1.23456"',
    },
    {
      problem: 'a price too large for the database',
      fields: withField(6, '100000000000000'),
      message: 'invalid price "100000000000000"',
    },
  ])('rejects $problem', ({ fields, message }) => {
    expect(parseLine(fields, 7, '2026-11-07')).toEqual({ ok: false, error: { line: 7, message } })
  })
})
