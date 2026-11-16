import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { readReportLines } from '@lib/ingest/read-report-lines'
import { generateCsv } from '../../../scripts/csv-generator'

const seededRandom = () => {
  let seed = 42
  return () => {
    seed = (seed * 16_807) % 2_147_483_647
    return seed / 2_147_483_647
  }
}

describe('generateCsv', () => {
  it('generates lines that the ingest parser accepts', async () => {
    const csv = generateCsv(50, { marker: 'smoke123' })

    const results = await Array.fromAsync(readReportLines(Readable.from([csv]), '2026-11-07'))

    expect(results).toHaveLength(50)
    expect(results.every((result) => result.ok)).toBe(true)
    expect(results.every((result) => result.ok && result.trade.notes?.endsWith('smoke123'))).toBe(
      true,
    )
  })

  it('draws every value from the injected random source', () => {
    expect(generateCsv(5, { random: seededRandom() })).toBe(
      generateCsv(5, { random: seededRandom() }),
    )
  })
})
