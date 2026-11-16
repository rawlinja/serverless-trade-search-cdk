import { isSide, MAX_QTY, type Side } from '@lib/trades/trade'
import { decodeCursor, type Cursor } from './cursor'
import { isAfter, isInstant } from './instant'

export type SearchParams = {
  account?: string
  advisor?: string
  symbol?: string
  side?: Side
  from?: string
  to?: string
  qtyMin?: number
  qtyMax?: number
  priceMin?: string
  priceMax?: string
  keyword?: string
  limit: number
  cursor?: Cursor
}

export type ParsedSearchParams =
  { ok: true; params: SearchParams } | { ok: false; details: string[] }

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 500
export const MAX_KEYWORD_LENGTH = 200

const KNOWN_PARAMS = new Set([
  'account',
  'advisor',
  'symbol',
  'side',
  'from',
  'to',
  'qty_min',
  'qty_max',
  'price_min',
  'price_max',
  'keyword',
  'limit',
  'cursor',
])
const WHOLE_NUMBER_PATTERN = /^\d+$/
const DECIMAL_PATTERN = /^\d+(\.\d+)?$/

class QueryReader {
  readonly details: string[] = []

  constructor(private readonly query: Record<string, string | undefined>) {}

  text(name: string): string | undefined {
    return this.query[name]?.trim() || undefined
  }

  side(): Side | undefined {
    const value = this.text('side')
    if (value === undefined || isSide(value)) return value
    return this.fail('side must be B or S')
  }

  instant(name: string): string | undefined {
    const value = this.text(name)
    if (value === undefined || isInstant(value)) return value
    return this.fail(`${name} must be an ISO 8601 timestamp with a time zone`)
  }

  wholeNumber(name: string): number | undefined {
    const value = this.text(name)
    if (value === undefined) return undefined
    if (WHOLE_NUMBER_PATTERN.test(value)) return Number(value)
    return this.fail(`${name} must be a whole number`)
  }

  quantity(name: string): number | undefined {
    const value = this.wholeNumber(name)
    if (value === undefined || value <= MAX_QTY) return value
    return this.fail(`${name} must be at most ${MAX_QTY}`)
  }

  decimal(name: string): string | undefined {
    const value = this.text(name)
    if (value === undefined || DECIMAL_PATTERN.test(value)) return value
    return this.fail(`${name} must be a decimal number`)
  }

  keyword(): string | undefined {
    const value = this.text('keyword')
    if (value === undefined || value.length <= MAX_KEYWORD_LENGTH) return value
    return this.fail(`keyword must be at most ${MAX_KEYWORD_LENGTH} characters`)
  }

  limit(): number {
    const value = this.wholeNumber('limit')
    if (value === undefined) return DEFAULT_LIMIT
    if (value >= 1 && value <= MAX_LIMIT) return value
    this.fail(`limit must be between 1 and ${MAX_LIMIT}`)
    return DEFAULT_LIMIT
  }

  cursor(): Cursor | undefined {
    const raw = this.text('cursor')
    if (raw === undefined) return undefined
    return decodeCursor(raw) ?? this.fail('cursor is invalid')
  }

  fail(detail: string): undefined {
    this.details.push(detail)
    return undefined
  }
}

export function parseSearchParams(query: Record<string, string | undefined>): ParsedSearchParams {
  const reader = new QueryReader(query)
  for (const name of Object.keys(query)) {
    if (!KNOWN_PARAMS.has(name)) reader.fail(`unknown parameter ${name}`)
  }

  const params: SearchParams = {
    account: reader.text('account'),
    advisor: reader.text('advisor'),
    symbol: reader.text('symbol'),
    side: reader.side(),
    from: reader.instant('from'),
    to: reader.instant('to'),
    qtyMin: reader.quantity('qty_min'),
    qtyMax: reader.quantity('qty_max'),
    priceMin: reader.decimal('price_min'),
    priceMax: reader.decimal('price_max'),
    keyword: reader.keyword(),
    limit: reader.limit(),
    cursor: reader.cursor(),
  }
  if (params.from && params.to && isAfter(params.from, params.to)) {
    reader.fail('from must not be after to')
  }

  return reader.details.length > 0 ? { ok: false, details: reader.details } : { ok: true, params }
}
