import { isSide, MAX_QTY, type RejectedLine, type Trade } from '@lib/trades/trade'
import { toTradedAt } from './trade-time'

export type ParsedLine =
  { ok: true; line: number; trade: Trade } | { ok: false; error: RejectedLine }

const COLUMN_COUNT = 8
const REQUIRED_COLUMN_COUNT = COLUMN_COUNT - 1
const WHOLE_NUMBER_PATTERN = /^\d+$/
const PRICE_PATTERN = /^\d{1,14}(\.\d{1,4})?$/

export function parseLine(fields: string[], line: number, tradeDate: string): ParsedLine {
  const reject = (message: string): ParsedLine => ({ ok: false, error: { line, message } })

  if (fields.length < REQUIRED_COLUMN_COUNT || fields.length > COLUMN_COUNT) {
    return reject(`expected ${COLUMN_COUNT} columns (notes optional), got ${fields.length}`)
  }

  const [account, advisor, symbol, time, side, qty, price, notes = ''] = fields
  if (!account || !advisor || !symbol) return reject('account, advisor and symbol are required')

  const tradedAt = toTradedAt(tradeDate, time)
  if (!tradedAt) return reject(`invalid time "${time}"`)
  if (!isSide(side)) return reject(`invalid side "${side}"`)
  if (!isQty(qty)) return reject(`invalid qty "${qty}"`)
  if (!PRICE_PATTERN.test(price)) return reject(`invalid price "${price}"`)

  return {
    ok: true,
    line,
    trade: {
      account,
      advisor,
      symbol,
      tradedAt,
      side,
      qty: Number(qty),
      price,
      notes: notes || null,
    },
  }
}

function isQty(value: string): boolean {
  return WHOLE_NUMBER_PATTERN.test(value) && Number(value) >= 1 && Number(value) <= MAX_QTY
}
