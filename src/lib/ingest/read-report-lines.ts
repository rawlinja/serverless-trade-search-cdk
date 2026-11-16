import type { Readable } from 'node:stream'
import { parse, type Info, type Options } from 'csv-parse'
import { parseLine, type ParsedLine } from './parse-line'

const CSV_OPTIONS = {
  bom: true,
  info: true,
  trim: true,
  skipEmptyLines: true,
  relaxColumnCount: true,
  relaxQuotes: true,
} satisfies Options

export async function* readReportLines(
  input: Readable,
  tradeDate: string,
): AsyncGenerator<ParsedLine> {
  const parser = parse(CSV_OPTIONS)
  input.on('error', (error) => parser.destroy(error))

  const records: AsyncIterable<{ record: string[]; info: Info }> = input.pipe(parser)

  for await (const { record, info } of records) {
    yield parseLine(record, info.lines, tradeDate)
  }
}
