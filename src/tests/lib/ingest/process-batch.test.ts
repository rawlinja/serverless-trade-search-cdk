import type { SQSEvent, SQSRecord } from 'aws-lambda'
import { describe, expect, it, vi } from 'vitest'
import { processBatch } from '@lib/ingest/process-batch'
import type { ReportRef } from '@lib/ingest/s3-event'

const s3Message = (key: string) =>
  JSON.stringify({
    Records: [{ s3: { bucket: { name: 'reports-bucket' }, object: { key, eTag: 'etag-1' } } }],
  })
const record = (messageId: string, body: string) => ({ messageId, body }) as SQSRecord
const event = (...records: SQSRecord[]): SQSEvent => ({ Records: records })

describe('processBatch', () => {
  it('ingests every report and reports no failures', async () => {
    const ingest = vi.fn().mockResolvedValue('succeeded')

    const result = await processBatch(
      event(record('m1', s3Message('reports/2026-11-07/a.csv'))),
      ingest,
    )

    expect(result).toEqual({ batchItemFailures: [] })
    expect(ingest).toHaveBeenCalledWith({
      bucket: 'reports-bucket',
      key: 'reports/2026-11-07/a.csv',
      etag: 'etag-1',
    })
  })

  it('acknowledges a dropped report so SQS does not retry it', async () => {
    const ingest = vi.fn().mockResolvedValue('dropped')

    const result = await processBatch(event(record('m1', s3Message('reports/a.csv'))), ingest)

    expect(result).toEqual({ batchItemFailures: [] })
  })

  it('reports only the messages whose ingestion threw, so SQS retries them', async () => {
    const ingest = vi.fn(async (ref: ReportRef) => {
      if (ref.key.endsWith('b.csv')) throw new Error('database unavailable')
      return 'succeeded' as const
    })

    const result = await processBatch(
      event(
        record('m1', s3Message('reports/2026-11-07/a.csv')),
        record('m2', s3Message('reports/2026-11-07/b.csv')),
      ),
      ingest,
    )

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'm2' }] })
  })

  it('reports a message whose body is not an S3 event', async () => {
    const result = await processBatch(event(record('m1', 'not json')), vi.fn())

    expect(result).toEqual({ batchItemFailures: [{ itemIdentifier: 'm1' }] })
  })

  it('ignores S3 test events', async () => {
    const ingest = vi.fn()

    const result = await processBatch(
      event(record('m1', JSON.stringify({ Event: 's3:TestEvent' }))),
      ingest,
    )

    expect(result).toEqual({ batchItemFailures: [] })
    expect(ingest).not.toHaveBeenCalled()
  })
})
