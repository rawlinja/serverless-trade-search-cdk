import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { PARAMETER_NAMES } from '@config/parameter-names'
import { generateCsv } from './csv-generator'

const SMOKE_TRADE_COUNT = 25
const POLL_INTERVAL_MS = 10_000
const TIMEOUT_MS = 5 * 60_000
const NEW_YORK_TIME_ZONE = 'America/New_York'
const CROSS_ORIGIN = 'https://example.com'

type SearchPage = { items: { symbol: string }[]; nextCursor: string | null }

const ssm = new SSMClient({})
const s3 = new S3Client({})

async function main(): Promise<void> {
  const [bucket, apiUrl] = await Promise.all([
    readParameter(PARAMETER_NAMES.reportsBucketName),
    readParameter(PARAMETER_NAMES.searchApiUrl),
  ])
  const marker = `smoke${Date.now()}`
  const tradeDate = Temporal.Now.plainDateISO(NEW_YORK_TIME_ZONE).toString()
  const key = `reports/${tradeDate}/${marker}.csv`

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: generateCsv(SMOKE_TRADE_COUNT, { marker }),
      ContentType: 'text/csv',
    }),
  )
  console.log(`Uploaded ${key}`)

  const page = await waitForTrades(apiUrl, marker)
  console.log(`Keyword search found all ${page.items.length} trades`)

  await expectSymbolFilter(apiUrl, marker, page.items[0].symbol)
  await expectInvalidParamsRejected(apiUrl)
  await expectAnyOriginAllowed(apiUrl)
  console.log('Smoke test passed')
}

async function waitForTrades(apiUrl: string, marker: string): Promise<SearchPage> {
  const deadline = Date.now() + TIMEOUT_MS

  while (Date.now() < deadline) {
    const page = await search(apiUrl, { keyword: marker, limit: '500' })
    if (page?.items.length === SMOKE_TRADE_COUNT) return page
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }

  throw new Error(`trades for ${marker} did not appear within ${TIMEOUT_MS / 1000}s`)
}

async function expectSymbolFilter(apiUrl: string, marker: string, symbol: string): Promise<void> {
  const page = await search(apiUrl, { keyword: marker, symbol, limit: '500' })
  const onlySymbol = page?.items.every((trade) => trade.symbol === symbol)

  if (!page || page.items.length === 0 || !onlySymbol) {
    throw new Error(`symbol filter returned unexpected trades for ${symbol}`)
  }
  console.log(`Symbol filter returned ${page.items.length} ${symbol} trades`)
}

async function expectInvalidParamsRejected(apiUrl: string): Promise<void> {
  const response = await fetch(`${apiUrl}/search?side=X`)

  if (response.status !== 400) throw new Error(`side=X returned ${response.status}, not 400`)
  console.log('Invalid parameters return 400')
}

async function expectAnyOriginAllowed(apiUrl: string): Promise<void> {
  const response = await fetch(`${apiUrl}/search?limit=1`, { headers: { origin: CROSS_ORIGIN } })
  const allowedOrigin = response.headers.get('access-control-allow-origin')

  if (allowedOrigin !== '*') throw new Error(`CORS allowed origin is ${allowedOrigin}, not *`)
  console.log('CORS allows any origin')
}

async function search(apiUrl: string, query: Record<string, string>): Promise<SearchPage | null> {
  const response = await fetch(`${apiUrl}/search?${new URLSearchParams(query)}`)
  if (response.status === 503) return null
  if (!response.ok) throw new Error(`search failed: ${response.status} ${await response.text()}`)
  return (await response.json()) as SearchPage
}

async function readParameter(name: string): Promise<string> {
  const { Parameter } = await ssm.send(new GetParameterCommand({ Name: name }))
  if (!Parameter?.Value) throw new Error(`missing SSM parameter ${name}`)
  return Parameter.Value
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
