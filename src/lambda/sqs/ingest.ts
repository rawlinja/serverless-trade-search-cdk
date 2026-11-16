import type { Readable } from 'node:stream'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import type { SQSEvent } from 'aws-lambda'
import { DataApiDb, dataApiConfigFromEnv } from '@lib/database/data-api-db'
import { ingestReport, type OpenedReport } from '@lib/ingest/ingest-report'
import { processBatch } from '@lib/ingest/process-batch'
import type { ReportRef } from '@lib/ingest/s3-event'

const INGEST_RESUME_RETRY_MS = 60_000

const s3 = new S3Client({})
const db = new DataApiDb(dataApiConfigFromEnv(), { resumeRetryMs: INGEST_RESUME_RETRY_MS })

async function openReport({ bucket, key }: ReportRef): Promise<OpenedReport> {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }))
  if (!object.Body) throw new Error(`no body for s3://${bucket}/${key}`)

  return { body: object.Body as Readable, sizeBytes: object.ContentLength ?? 0 }
}

export const handler = (event: SQSEvent) =>
  processBatch(event, (ref) => ingestReport({ db, openReport }, ref))
