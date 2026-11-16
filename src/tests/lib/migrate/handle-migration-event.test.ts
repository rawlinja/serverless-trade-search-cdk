import type { CloudFormationCustomResourceEvent } from 'aws-lambda'
import { describe, expect, it } from 'vitest'
import { createMigrationHandler, MIGRATIONS_RESOURCE_ID } from '@lib/migrate/handle-migration-event'
import type { Db } from '@lib/database/db'

const recordingDb = () => {
  const statements: string[] = []
  const db: Db = {
    execute: async (sql) => {
      statements.push(sql)
      return []
    },
  }
  return { db, statements }
}

const event = (requestType: string) =>
  ({
    RequestType: requestType,
    PhysicalResourceId: 'existing-id',
  }) as unknown as CloudFormationCustomResourceEvent

describe('migration handler', () => {
  it.each(['Create', 'Update'])('applies migrations on %s', async (requestType) => {
    const { db, statements } = recordingDb()

    const result = await createMigrationHandler(db)(event(requestType))

    expect(result).toEqual({ PhysicalResourceId: MIGRATIONS_RESOURCE_ID })
    expect(
      statements.some((sql) => sql.includes('create table if not exists ingested_lines')),
    ).toBe(true)
  })

  it('does nothing on Delete', async () => {
    const { db, statements } = recordingDb()

    const result = await createMigrationHandler(db)(event('Delete'))

    expect(result).toEqual({ PhysicalResourceId: 'existing-id' })
    expect(statements).toEqual([])
  })
})
