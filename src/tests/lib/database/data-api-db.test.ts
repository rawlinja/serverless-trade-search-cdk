import { ExecuteStatementCommand, RDSDataClient } from '@aws-sdk/client-rds-data'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { DataApiDb, DatabaseResumingError, dataApiConfigFromEnv } from '@lib/database/data-api-db'

const DATA_API_CONFIG = {
  resourceArn: 'arn:aws:rds:us-east-1:123456789012:cluster:trades',
  secretArn: 'arn:aws:secretsmanager:us-east-1:123456789012:secret:db',
  database: 'trades',
}
const rdsData = mockClient(RDSDataClient)
const resuming = () => Object.assign(new Error('resuming'), { name: 'DatabaseResumingException' })
const createDb = (resumeRetryMs = 0) =>
  new DataApiDb(DATA_API_CONFIG, { resumeRetryMs, retryDelayMs: 0 }, new RDSDataClient({}))

beforeEach(() => rdsData.reset())

describe('DataApiDb', () => {
  it('sends typed named parameters and parses JSON records', async () => {
    rdsData.on(ExecuteStatementCommand).resolves({ formattedRecords: '[{"id":1}]' })

    const rows = await createDb().execute('select :a, :b, :c, :d, :e', {
      a: 'x',
      b: 2,
      c: 1.5,
      d: true,
      e: null,
    })

    expect(rows).toEqual([{ id: 1 }])
    expect(rdsData.commandCalls(ExecuteStatementCommand)[0].args[0].input).toMatchObject({
      ...DATA_API_CONFIG,
      formatRecordsAs: 'JSON',
      parameters: [
        { name: 'a', value: { stringValue: 'x' } },
        { name: 'b', value: { longValue: 2 } },
        { name: 'c', value: { doubleValue: 1.5 } },
        { name: 'd', value: { booleanValue: true } },
        { name: 'e', value: { isNull: true } },
      ],
    })
  })

  it('returns no rows for statements without a result set', async () => {
    rdsData.on(ExecuteStatementCommand).resolves({})

    expect(await createDb().execute('update t set x = 1')).toEqual([])
  })

  it('retries while the database resumes from pause', async () => {
    rdsData.on(ExecuteStatementCommand).rejectsOnce(resuming()).resolves({ formattedRecords: '[]' })

    expect(await createDb(1_000).execute('select 1')).toEqual([])
    expect(rdsData.commandCalls(ExecuteStatementCommand)).toHaveLength(2)
  })

  it('gives up with DatabaseResumingError after the retry window', async () => {
    rdsData.on(ExecuteStatementCommand).rejects(resuming())

    await expect(createDb(0).execute('select 1')).rejects.toBeInstanceOf(DatabaseResumingError)
  })

  it('rethrows other errors immediately', async () => {
    rdsData.on(ExecuteStatementCommand).rejects(new Error('bad sql'))

    await expect(createDb(1_000).execute('select')).rejects.toThrow('bad sql')
    expect(rdsData.commandCalls(ExecuteStatementCommand)).toHaveLength(1)
  })
})

describe('dataApiConfigFromEnv', () => {
  it('reads the cluster, secret and database from the environment', () => {
    const env = { DB_CLUSTER_ARN: 'cluster', DB_SECRET_ARN: 'secret', DB_NAME: 'trades' }

    expect(dataApiConfigFromEnv(env)).toEqual({
      resourceArn: 'cluster',
      secretArn: 'secret',
      database: 'trades',
    })
  })

  it('fails fast when a variable is missing', () => {
    expect(() => dataApiConfigFromEnv({})).toThrow('missing env var DB_CLUSTER_ARN')
  })
})
