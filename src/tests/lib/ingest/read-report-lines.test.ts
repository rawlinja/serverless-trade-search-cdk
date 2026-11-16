import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readReportLines } from '@lib/ingest/read-report-lines'

const SAMPLE_LINE =
  '1234, JD1, AAPL, 09:30:05.100, B, 10, 134.30, "Brian asked for AAPL in his portfolio OR REBALANCE"'

const LINE_WITHOUT_NOTES = '1234, JD1, AAPL, 09:30:05.100, B, 10, 134.30'

const read = (csv: string) => Array.fromAsync(readReportLines(Readable.from([csv]), '2026-11-07'))

describe('readReportLines', () => {
  it('parses the sample line from the design', async () => {
    const [result] = await read(`${SAMPLE_LINE}\n`)

    expect(result).toEqual({
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
        notes: 'Brian asked for AAPL in his portfolio OR REBALANCE',
      },
    })
  })

  it('keeps commas inside quoted notes', async () => {
    const [result] = await read('1234, JD1, AAPL, 09:30:05, S, 5, 10.00, "sell, then rebalance"\n')

    expect(result.ok && result.trade.notes).toBe('sell, then rebalance')
  })

  it('numbers lines by their position in the report, counting blank lines', async () => {
    const results = await read(`${SAMPLE_LINE}\n\n${SAMPLE_LINE}\n`)

    expect(results.map((result) => result.ok && result.line)).toEqual([1, 3])
  })

  it('reports invalid lines and keeps reading', async () => {
    const results = await read(
      `1234, JD1, AAPL, 09:30:05, X, 10, 1.00, "bad side"\n${SAMPLE_LINE}\n`,
    )

    expect(results[0]).toEqual({ ok: false, error: { line: 1, message: 'invalid side "X"' } })
    expect(results[1].ok).toBe(true)
  })

  it('keeps a stray quote inside an unquoted note and keeps reading', async () => {
    const results = await read(
      `1234, JD1, AAPL, 09:30:05, B, 1, 1.00, he said "buy"\n${SAMPLE_LINE}\n`,
    )

    expect(results[0].ok && results[0].trade.notes).toBe('he said "buy"')
    expect(results[1].ok).toBe(true)
  })

  it('accepts a line with the notes column omitted', async () => {
    const [result] = await read(`${LINE_WITHOUT_NOTES}\n`)

    expect(result.ok && result.trade.notes).toBeNull()
  })

  it.each([
    { name: 'an empty', ending: ',' },
    { name: 'a blank', ending: ', ' },
  ])('accepts a line ending in $name notes field', async ({ ending }) => {
    const [result] = await read(`${LINE_WITHOUT_NOTES}${ending}\n`)

    expect(result.ok && result.trade.notes).toBeNull()
  })

  it.each([
    { name: 'too few columns', line: '1234, JD1, AAPL, 09:30:05, B, 10', count: 6 },
    { name: 'an unquoted comma in the notes', line: `${LINE_WITHOUT_NOTES}, a, b`, count: 9 },
  ])('rejects a line with $name and keeps reading', async ({ line, count }) => {
    const results = await read(`${SAMPLE_LINE}\n${line}\n${SAMPLE_LINE}\n`)

    expect(results[1]).toEqual({
      ok: false,
      error: { line: 2, message: `expected 8 columns (notes optional), got ${count}` },
    })
    expect(results.map((result) => result.ok)).toEqual([true, false, true])
  })

  it('parses CRLF line endings and counts blank lines', async () => {
    const results = await read(`${SAMPLE_LINE}\r\n\r\n${LINE_WITHOUT_NOTES}, ok\r\n`)

    expect(results.map((result) => result.ok && result.line)).toEqual([1, 3])
    expect(results[1].ok && results[1].trade.notes).toBe('ok')
  })

  it('ignores a byte-order mark at the start of the report', async () => {
    const [result] = await read(`\uFEFF${SAMPLE_LINE}\n`)

    expect(result.ok && result.trade.account).toBe('1234')
  })

  it('fails the whole report on an unclosed quote', async () => {
    const unclosed = '1234, JD1, AAPL, 09:30:05, B, 1, 1.00, "never closed\n'

    await expect(read(`${SAMPLE_LINE}\n${unclosed}`)).rejects.toThrow(/Quote Not Closed/)
  })

  it('fails when the report stream fails', async () => {
    async function* brokenReport() {
      yield `${SAMPLE_LINE}\n`
      throw new Error('connection reset')
    }

    const lines = readReportLines(Readable.from(brokenReport()), '2026-11-07')

    await expect(Array.fromAsync(lines)).rejects.toThrow('connection reset')
  })
})
