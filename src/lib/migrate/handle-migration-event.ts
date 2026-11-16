import { Logger } from '@aws-lambda-powertools/logger'
import type { CloudFormationCustomResourceEvent } from 'aws-lambda'
import type { Db } from '@lib/database/db'
import { runMigrations } from './run-migrations'

export const MIGRATIONS_RESOURCE_ID = 'trade-search-migrations'

const logger = new Logger({ serviceName: 'migrate' })

export function createMigrationHandler(db: Db) {
  return async (event: CloudFormationCustomResourceEvent) => {
    if (event.RequestType === 'Delete') return { PhysicalResourceId: event.PhysicalResourceId }

    const applied = await runMigrations(db)
    logger.info('Migrations applied', { applied })
    return { PhysicalResourceId: MIGRATIONS_RESOURCE_ID }
  }
}
