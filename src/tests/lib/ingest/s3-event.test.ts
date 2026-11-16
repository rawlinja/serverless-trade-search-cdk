import { describe, expect, it } from 'vitest'
import { reportRefsFromMessage } from '@lib/ingest/s3-event'

const message = (key: string) =>
  JSON.stringify({
    Records: [{ s3: { bucket: { name: 'reports-bucket' }, object: { key, eTag: 'etag-1' } } }],
  })

describe('reportRefsFromMessage', () => {
  it('reads the bucket, decoded key and etag', () => {
    expect(reportRefsFromMessage(message('reports/2026-11-07/robinhood+0930%2Bam.csv'))).toEqual([
      { bucket: 'reports-bucket', key: 'reports/2026-11-07/robinhood 0930+am.csv', etag: 'etag-1' },
    ])
  })

  it('returns nothing for the S3 test event', () => {
    expect(reportRefsFromMessage(JSON.stringify({ Event: 's3:TestEvent' }))).toEqual([])
  })

  it('throws on a body that is not JSON', () => {
    expect(() => reportRefsFromMessage('not json')).toThrow()
  })
})
