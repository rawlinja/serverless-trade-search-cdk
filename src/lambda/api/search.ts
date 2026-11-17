import { DataApiDb, dataApiConfigFromEnv } from '@lib/database/data-api-db'
import { createSearchHandler } from '@lib/search/handle-search'

const SEARCH_RESUME_RETRY_MS = 10_000

export const handler = createSearchHandler(
  new DataApiDb(dataApiConfigFromEnv(), { resumeRetryMs: SEARCH_RESUME_RETRY_MS }),
)
