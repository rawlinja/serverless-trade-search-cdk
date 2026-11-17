import type { APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2 } from 'aws-lambda'
import { DatabaseResumingError } from '@lib/database/data-api-db'
import type { Db } from '@lib/database/db'
import { parseSearchParams } from './search-params'
import { searchTrades } from './search-query'

export type SearchHandler = (
  event: APIGatewayProxyEventV2,
) => Promise<APIGatewayProxyStructuredResultV2>

export const RETRY_AFTER_SECONDS = 5

export function createSearchHandler(db: Db): SearchHandler {
  return async (event) => {
    const parsed = parseSearchParams(event.queryStringParameters ?? {})
    if (!parsed.ok) {
      return jsonResponse(400, { error: 'invalid search parameters', details: parsed.details })
    }

    try {
      return jsonResponse(200, await searchTrades(db, parsed.params))
    } catch (error) {
      if (!(error instanceof DatabaseResumingError)) throw error
      return jsonResponse(
        503,
        { error: 'database resuming' },
        { 'retry-after': String(RETRY_AFTER_SECONDS) },
      )
    }
  }
}

function jsonResponse(
  statusCode: number,
  body: unknown,
  headers: Record<string, string> = {},
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  }
}
