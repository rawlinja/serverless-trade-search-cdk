const NEW_YORK_TIME_ZONE = 'America/New_York'
const MINUTE_MS = 60_000
const DATETIME_LOCAL_WITHOUT_SECONDS_LENGTH = 16
const OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK_TIME_ZONE,
  timeZoneName: 'longOffset',
})
const WALL_CLOCK_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hourCycle: 'h23',
})

export function toQueryString(fields, cursor) {
  const query = new URLSearchParams()

  for (const [name, value] of Object.entries(fields)) {
    const trimmed = String(value ?? '').trim()
    if (trimmed) query.set(name, trimmed)
  }
  if (cursor) query.set('cursor', cursor)

  return query.toString()
}

export function toNewYorkInstant(localDateTime) {
  if (!localDateTime) return ''

  const wallClock =
    localDateTime.length === DATETIME_LOCAL_WITHOUT_SECONDS_LENGTH
      ? `${localDateTime}:00`
      : localDateTime
  const wallClockAsUtc = Date.parse(`${wallClock}Z`)
  const estimatedOffset = newYorkOffsetAt(wallClockAsUtc)
  const instant = wallClockAsUtc - offsetMinutes(estimatedOffset) * MINUTE_MS

  return `${wallClock}${newYorkOffsetAt(instant)}`
}

export function formatNewYorkTime(instant) {
  const parts = Object.fromEntries(
    WALL_CLOCK_FORMAT.formatToParts(new Date(instant)).map(({ type, value }) => [type, value]),
  )
  const date = `${parts.year}-${parts.month}-${parts.day}`
  const time = `${parts.hour}:${parts.minute}:${parts.second}.${parts.fractionalSecond}`

  return `${date} ${time}`
}

function newYorkOffsetAt(epochMs) {
  const zoneName = OFFSET_FORMAT.formatToParts(epochMs).find(({ type }) => type === 'timeZoneName')
  return zoneName.value.replace('GMT', '')
}

function offsetMinutes(offset) {
  const [hours, minutes] = offset.slice(1).split(':').map(Number)
  const sign = offset.startsWith('-') ? -1 : 1
  return sign * (hours * 60 + minutes)
}
