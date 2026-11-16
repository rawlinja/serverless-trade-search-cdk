export type ReportRef = { bucket: string; key: string; etag: string }

type S3EventRecord = { s3: { bucket: { name: string }; object: { key: string; eTag: string } } }
type S3EventMessage = { Event?: string; Records?: S3EventRecord[] }

const S3_TEST_EVENT = 's3:TestEvent'

export function reportRefsFromMessage(body: string): ReportRef[] {
  const message = JSON.parse(body) as S3EventMessage
  if (message.Event === S3_TEST_EVENT) return []

  return (message.Records ?? []).map(({ s3 }) => ({
    bucket: s3.bucket.name,
    key: decodeS3Key(s3.object.key),
    etag: s3.object.eTag,
  }))
}

function decodeS3Key(key: string): string {
  return decodeURIComponent(key.replace(/\+/g, ' '))
}
