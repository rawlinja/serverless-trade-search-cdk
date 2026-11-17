import type { APIGatewayProxyEventV2 } from 'aws-lambda'
import { describe, expect, it, vi } from 'vitest'
import { DatabaseResumingError } from '@lib/database/data-api-db'
import type { Db, SqlRow } from '@lib/database/db'
import { createSearchHandler } from '@lib/search/handle-search'

const event = (query?: Record<string, string>) =>
  ({ queryStringParameters: query }) as APIGatewayProxyEventV2
const dbReturning = (rows: SqlRow[]): Db => ({ execute: vi.fn().mockResolvedValue(rows) })
const dbFailingWith = (error: Error): Db => ({ execute: vi.fn().mockRejectedValue(error) })

describe('search handler', () => {
  it('returns 400 with details for invalid parameters', async () => {
    const db = dbReturning([])

    const response = await createSearchHandler(db)(event({ side: 'X' }))

    expect(response.statusCode).toBe(400)
    expect(JSON.parse(response.body ?? '')).toEqual({
      error: 'invalid search parameters',
      details: ['side must be B or S'],
    })
    expect(db.execute).not.toHaveBeenCalled()
  })

  it('returns the matching trades', async () => {
    const db = dbReturning([
      {
        id: 1,
        account: '1234',
        advisor: 'JD1',
        symbol: 'AAPL',
        traded_at_ms: Date.parse('2026-11-07T14:30:05.100Z'),
        side: 'B',
        qty: 10,
        price: '134.3000',
        notes: 'Brian asked for AAPL',
      },
    ])

    const response = await createSearchHandler(db)(event({ account: '1234' }))

    expect(response.statusCode).toBe(200)
    expect(response.headers).toMatchObject({ 'content-type': 'application/json' })
    expect(JSON.parse(response.body ?? '')).toEqual({
      items: [
        {
          id: 1,
          account: '1234',
          advisor: 'JD1',
          symbol: 'AAPL',
          tradedAt: '2026-11-07T14:30:05.100Z',
          side: 'B',
          qty: 10,
          price: '134.3000',
          notes: 'Brian asked for AAPL',
        },
      ],
      nextCursor: null,
    })
  })

  it('searches with the parsed filters', async () => {
    const db = dbReturning([])

    await createSearchHandler(db)(event({ account: '1234', limit: '10' }))

    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('account = :account::text'), {
      account: '1234',
      limit: 11,
    })
  })

  it('returns the latest trades for a request without a query string', async () => {
    const response = await createSearchHandler(dbReturning([]))(event())

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body ?? '')).toEqual({ items: [], nextCursor: null })
  })

  it('returns 503 with Retry-After while the database resumes', async () => {
    const response = await createSearchHandler(dbFailingWith(new DatabaseResumingError()))(event())

    expect(response.statusCode).toBe(503)
    expect(response.headers).toMatchObject({ 'retry-after': '5' })
    expect(JSON.parse(response.body ?? '')).toEqual({ error: 'database resuming' })
  })

  it('rethrows unexpected errors', async () => {
    await expect(createSearchHandler(dbFailingWith(new Error('boom')))(event())).rejects.toThrow(
      'boom',
    )
  })
})
