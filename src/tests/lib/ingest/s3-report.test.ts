import { Readable } from 'node:stream'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { mockClient } from 'aws-sdk-client-mock'
import { beforeEach, describe, expect, it } from 'vitest'
import { ReportChangedError } from '@lib/ingest/ingest-report'
import { s3ReportOpener } from '@lib/ingest/s3-report'

const REPORT_REF = { bucket: 'reports-bucket', key: 'reports/2026-11-07/a.csv', etag: 'etag-1' }
const s3 = mockClient(S3Client)
const openReport = s3ReportOpener(new S3Client({}))
const asBody = (body: Readable) => body as never

beforeEach(() => s3.reset())

describe('s3ReportOpener', () => {
  it.each([
    { name: 'an unquoted', etag: 'etag-1' },
    { name: 'an already quoted', etag: '"etag-1"' },
  ])('sends the exact version as a quoted IfMatch for $name etag', async ({ etag }) => {
    s3.on(GetObjectCommand).resolves({ Body: asBody(Readable.from([''])), ContentLength: 1 })

    await openReport({ ...REPORT_REF, etag })

    expect(s3.commandCalls(GetObjectCommand)[0].args[0].input).toEqual({
      Bucket: 'reports-bucket',
      Key: 'reports/2026-11-07/a.csv',
      IfMatch: '"etag-1"',
    })
  })

  it('returns the body and its content length', async () => {
    const body = Readable.from(['x'])
    s3.on(GetObjectCommand).resolves({ Body: asBody(body), ContentLength: 42 })

    expect(await openReport(REPORT_REF)).toEqual({ body, sizeBytes: 42 })
  })

  it.each([
    { name: 'error name', failure: { name: 'PreconditionFailed' } },
    { name: 'HTTP status', failure: { $metadata: { httpStatusCode: 412 } } },
  ])('turns a failed precondition found by $name into ReportChangedError', async ({ failure }) => {
    s3.on(GetObjectCommand).rejects(
      Object.assign(
        new Error('At least one of the pre-conditions you specified did not hold'),
        failure,
      ),
    )

    await expect(openReport(REPORT_REF)).rejects.toBeInstanceOf(ReportChangedError)
  })

  it('fails when the object has no body', async () => {
    s3.on(GetObjectCommand).resolves({ ContentLength: 1 })

    await expect(openReport(REPORT_REF)).rejects.toThrow(
      'no body for s3://reports-bucket/reports/2026-11-07/a.csv',
    )
  })

  it('rethrows any other failure unchanged', async () => {
    const failure = Object.assign(new Error('missing'), {
      name: 'NoSuchKey',
      $metadata: { httpStatusCode: 404 },
    })
    s3.on(GetObjectCommand).rejects(failure)

    await expect(openReport(REPORT_REF)).rejects.toBe(failure)
  })

  it('treats a missing content length as too large', async () => {
    s3.on(GetObjectCommand).resolves({ Body: asBody(Readable.from([''])) })

    expect((await openReport(REPORT_REF)).sizeBytes).toBe(Number.POSITIVE_INFINITY)
  })
})
