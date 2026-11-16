import type { Readable } from 'node:stream'
import { parse, type Info, type Options } from 'csv-parse'
import { parseLine, type ParsedLine } from './parse-line'

const CSV_OPTIONS = {
  bom: true,
  // Each record comes with info.lines, the report line it ends on, used as its line number.
  info: true,
  trim: true,
  skip_empty_lines: true,
  // Each line's column count is checked by parseLine, so one bad line doesn't fail the report.
  relax_column_count: true,
  // Keeps a stray quote inside an unquoted note as text.
  relax_quotes: true,
} satisfies Options

export async function* readReportLines(
  input: Readable,
  tradeDate: string,
): AsyncGenerator<ParsedLine> {
  const parser = parse(CSV_OPTIONS)
  // pipe() doesn't forward source errors; without this a failed S3 stream hangs the parser.
  input.on('error', (error) => parser.destroy(error))

  const records: AsyncIterable<{ record: string[]; info: Info }> = input.pipe(parser)

  for await (const { record, info } of records) {
    yield parseLine(record, info.lines, tradeDate)
  }
}
