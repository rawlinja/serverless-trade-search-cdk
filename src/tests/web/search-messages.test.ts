import { describe, expect, it } from 'vitest'
import { searchFailureMessage } from '../../../web/search-messages.js'

describe('searchFailureMessage', () => {
  it.each([
    { when: 'the network fails', status: null, body: null, message: 'Search failed — try again' },
    {
      when: 'the API lists details',
      status: 400,
      body: {
        error: 'invalid search parameters',
        details: ['side must be B or S', 'limit must be between 1 and 500'],
      },
      message: 'side must be B or S; limit must be between 1 and 500',
    },
    { when: 'a 400 has only an error', status: 400, body: { error: 'bad' }, message: 'bad' },
    { when: 'a 400 is not JSON', status: 400, body: {}, message: 'Search failed — try again' },
    {
      when: 'throttled',
      status: 429,
      body: {},
      message: 'Too many searches — try again in a moment',
    },
    {
      when: 'the database never woke',
      status: 503,
      body: {},
      message: 'Database is still waking up — try again in a moment',
    },
    { when: 'the server fails', status: 500, body: {}, message: 'Search failed — try again' },
  ])('explains $when', ({ status, body, message }) => {
    expect(searchFailureMessage(status, body)).toBe(message)
  })
})
