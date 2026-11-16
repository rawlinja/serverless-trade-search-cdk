import { DataApiDb, dataApiConfigFromEnv } from '@lib/database/data-api-db'
import { createMigrationHandler } from '@lib/migrate/handle-migration-event'

const MIGRATE_RESUME_RETRY_MS = 120_000

export const handler = createMigrationHandler(
  new DataApiDb(dataApiConfigFromEnv(), { resumeRetryMs: MIGRATE_RESUME_RETRY_MS }),
)
