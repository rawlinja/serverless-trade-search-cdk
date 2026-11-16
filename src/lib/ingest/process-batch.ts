import { Logger } from '@aws-lambda-powertools/logger'
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda'
import type { IngestOutcome } from './ingest-report'
import { reportRefsFromMessage, type ReportRef } from './s3-event'

export type ReportIngester = (ref: ReportRef) => Promise<IngestOutcome>

const logger = new Logger({ serviceName: 'ingest' })

export async function processBatch(
  event: SQSEvent,
  ingest: ReportIngester,
): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = []

  for (const record of event.Records) {
    try {
      for (const ref of reportRefsFromMessage(record.body)) {
        const outcome = await ingest(ref)
        logger.info('Report processed', { key: ref.key, etag: ref.etag, outcome })
      }
    } catch (error) {
      logger.error('Report failed; SQS will retry', { messageId: record.messageId, error })
      batchItemFailures.push({ itemIdentifier: record.messageId })
    }
  }

  return { batchItemFailures }
}
