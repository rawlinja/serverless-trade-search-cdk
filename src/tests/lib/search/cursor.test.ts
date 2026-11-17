import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor } from '@lib/search/cursor'

const encode = (json: string) => Buffer.from(json).toString('base64url')

describe('cursor', () => {
  it('round-trips a position', () => {
    const cursor = { tradedAt: '2026-11-07T14:30:05.100Z', id: 42 }

    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor)
  })

  it.each([
    { problem: 'garbage', raw: 'not-a-cursor' },
    { problem: 'the wrong shape', raw: encode('{"id":"x"}') },
    { problem: 'an invalid time', raw: encode('{"tradedAt":"later","id":1}') },
    { problem: 'an impossible date', raw: encode('{"tradedAt":"2026-02-30T00:00:00Z","id":1}') },
    { problem: 'null', raw: encode('null') },
    { problem: 'a non-positive id', raw: encode('{"tradedAt":"2026-11-07T14:30:05.100Z","id":0}') },
  ])('rejects $problem', ({ raw }) => {
    expect(decodeCursor(raw)).toBeNull()
  })
})
