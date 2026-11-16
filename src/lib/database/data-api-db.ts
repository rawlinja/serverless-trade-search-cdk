import {
  ExecuteStatementCommand,
  RDSDataClient,
  type Field,
  type SqlParameter,
} from '@aws-sdk/client-rds-data'
import type { Db, SqlParams, SqlRow, SqlValue } from './db'

export type DataApiConfig = { resourceArn: string; secretArn: string; database: string }
export type RetryPolicy = { resumeRetryMs: number; retryDelayMs?: number }

const DEFAULT_RETRY_DELAY_MS = 1_000

const WAITING_FOR_DATABASE_ERRORS = new Set([
  'DatabaseResumingException',
  'DatabaseUnavailableException',
])

export class DatabaseResumingError extends Error {
  constructor() {
    super('database is not available yet')
    this.name = 'DatabaseResumingError'
  }
}

export class DataApiDb implements Db {
  constructor(
    private readonly config: DataApiConfig,
    private readonly retry: RetryPolicy,
    private readonly client = new RDSDataClient({}),
  ) {}

  async execute(sql: string, params: SqlParams = {}): Promise<SqlRow[]> {
    const command = new ExecuteStatementCommand({
      ...this.config,
      sql,
      parameters: toSqlParameters(params),
      formatRecordsAs: 'JSON',
    })
    const deadline = Date.now() + this.retry.resumeRetryMs

    for (;;) {
      try {
        const result = await this.client.send(command)
        return result.formattedRecords ? (JSON.parse(result.formattedRecords) as SqlRow[]) : []
      } catch (error) {
        if (!isWaitingForDatabase(error)) throw error
        if (Date.now() >= deadline) throw new DatabaseResumingError()
        await sleep(this.retry.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)
      }
    }
  }
}

export function dataApiConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DataApiConfig {
  return {
    resourceArn: requireEnv(env, 'DB_CLUSTER_ARN'),
    secretArn: requireEnv(env, 'DB_SECRET_ARN'),
    database: requireEnv(env, 'DB_NAME'),
  }
}

function requireEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (!value) throw new Error(`missing env var ${name}`)
  return value
}

function isWaitingForDatabase(error: unknown): boolean {
  return error instanceof Error && WAITING_FOR_DATABASE_ERRORS.has(error.name)
}

function toSqlParameters(params: SqlParams): SqlParameter[] {
  return Object.entries(params).map(([name, value]) => ({ name, value: toField(value) }))
}

function toField(value: SqlValue): Field {
  if (value === null) return { isNull: true }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { longValue: value } : { doubleValue: value }
  }
  return { stringValue: value }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
