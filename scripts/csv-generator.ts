const ACCOUNTS = ['1234', '5678', '9012', '3456']
const ADVISORS = ['JD1', 'AB2', 'CK3']
const SYMBOLS = ['AAPL', 'MSFT', 'AMZN', 'GOOG', 'TSLA']
const SIDES = ['B', 'S']
const NOTE_TEMPLATES = [
  'Client asked for {symbol} in the portfolio',
  'REBALANCE quarterly allocation',
  'Rebalancing toward {symbol}',
  'Tax-loss harvest on {symbol}',
  'Advisor recommended trimming {symbol}',
]
const MARKET_OPEN = Temporal.PlainTime.from('09:30')
const MARKET_SESSION_MS = 6.5 * 60 * 60 * 1000
const MAX_GENERATED_QTY = 1000
const MIN_PRICE = 1
const PRICE_SPREAD = 499

export type GenerateOptions = { marker?: string; random?: () => number }

export function generateCsv(
  tradeCount: number,
  { marker, random = Math.random }: GenerateOptions = {},
): string {
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]

  const lines = Array.from({ length: tradeCount }, () => {
    const symbol = pick(SYMBOLS)
    const note = [pick(NOTE_TEMPLATES).replace('{symbol}', symbol), marker]
      .filter(Boolean)
      .join(' ')
    const time = MARKET_OPEN.add({ milliseconds: Math.floor(random() * MARKET_SESSION_MS) })

    return [
      pick(ACCOUNTS),
      pick(ADVISORS),
      symbol,
      time.toString({ smallestUnit: 'millisecond' }),
      pick(SIDES),
      1 + Math.floor(random() * MAX_GENERATED_QTY),
      (MIN_PRICE + random() * PRICE_SPREAD).toFixed(2),
      `"${note}"`,
    ].join(', ')
  })

  return `${lines.join('\n')}\n`
}
