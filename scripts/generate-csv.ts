import { generateCsv } from './csv-generator'

const DEFAULT_TRADE_COUNT = 1000

const tradeCount = Number(process.argv[2] ?? DEFAULT_TRADE_COUNT)

if (!Number.isInteger(tradeCount) || tradeCount < 1) {
  console.error('usage: pnpm generate-csv [tradeCount]')
  process.exit(1)
}

process.stdout.write(generateCsv(tradeCount))
