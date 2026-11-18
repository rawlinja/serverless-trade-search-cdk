const GENERIC_FAILURE = 'Search failed — try again'
const THROTTLED = 'Too many searches — try again in a moment'
const DATABASE_WAKING = 'Database is still waking up — try again in a moment'

export function searchFailureMessage(status, body) {
  if (status === 400) return badRequestMessage(body)
  if (status === 429) return THROTTLED
  if (status === 503) return DATABASE_WAKING
  return GENERIC_FAILURE
}

function badRequestMessage(body) {
  if (Array.isArray(body?.details) && body.details.length > 0) return body.details.join('; ')
  return body?.error || GENERIC_FAILURE
}
