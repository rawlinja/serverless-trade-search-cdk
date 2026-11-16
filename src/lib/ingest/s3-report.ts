import type { Readable } from 'node:stream'
import { GetObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { ReportChangedError, type OpenedReport } from './ingest-report'
import type { ReportRef } from './s3-event'

const PRECONDITION_FAILED_STATUS = 412

export function s3ReportOpener(s3: S3Client): (ref: ReportRef) => Promise<OpenedReport> {
  return async ({ bucket, key, etag }) => {
    const object = await s3
      .send(new GetObjectCommand({ Bucket: bucket, Key: key, IfMatch: quotedEtag(etag) }))
      .catch((error) => {
        throw isPreconditionFailed(error) ? new ReportChangedError() : error
      })
    if (!object.Body) throw new Error(`no body for s3://${bucket}/${key}`)

    return {
      body: object.Body as Readable,
      sizeBytes: object.ContentLength ?? Number.POSITIVE_INFINITY,
    }
  }
}

function quotedEtag(etag: string): string {
  return `"${etag.replace(/^"|"$/g, '')}"`
}

function isPreconditionFailed(error: unknown): boolean {
  const { name, $metadata } = error as { name?: string; $metadata?: { httpStatusCode?: number } }
  return $metadata?.httpStatusCode === PRECONDITION_FAILED_STATUS || name === 'PreconditionFailed'
}
