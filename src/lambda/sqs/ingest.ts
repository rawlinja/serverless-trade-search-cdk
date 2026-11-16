import { S3Client } from '@aws-sdk/client-s3'
import type { SQSEvent } from 'aws-lambda'
import { DataApiDb, dataApiConfigFromEnv } from '@lib/database/data-api-db'
import { ingestReport } from '@lib/ingest/ingest-report'
import { processBatch } from '@lib/ingest/process-batch'
import { s3ReportOpener } from '@lib/ingest/s3-report'

const INGEST_RESUME_RETRY_MS = 60_000

const db = new DataApiDb(dataApiConfigFromEnv(), { resumeRetryMs: INGEST_RESUME_RETRY_MS })
const openReport = s3ReportOpener(new S3Client({}))

export const handler = (event: SQSEvent) =>
  processBatch(event, (ref) => ingestReport({ db, openReport }, ref))
