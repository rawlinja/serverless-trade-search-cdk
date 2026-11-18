const NEW_YORK_TIME_ZONE = 'America/New_York'
const MINUTE_MS = 60_000
const DATETIME_LOCAL_WITHOUT_SECONDS_LENGTH = 16
const OFFSET_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK_TIME_ZONE,
  timeZoneName: 'longOffset',
})
const NEW_YORK_DATE_FORMAT = new Intl.DateTimeFormat('en-CA', { timeZone: NEW_YORK_TIME_ZONE })
const DAY_MS = 86_400_000
const LAST_7_DAYS_BACK = 6
const FIELD_LABELS = {
  account: 'Account',
  advisor: 'Advisor',
  symbol: 'Symbol',
  side: 'Side',
  from: 'From',
  to: 'To',
  qty_min: 'Qty min',
  qty_max: 'Qty max',
  price_min: 'Price min',
  price_max: 'Price max',
  keyword: 'Keywords',
}
const SIDE_NAMES = { B: 'Buy', S: 'Sell' }

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

function newYorkOffsetAt(epochMs) {
  const zoneName = OFFSET_FORMAT.formatToParts(epochMs).find(({ type }) => type === 'timeZoneName')
  return zoneName.value.replace('GMT', '')
}

function offsetMinutes(offset) {
  const [hours, minutes] = offset.slice(1).split(':').map(Number)
  const sign = offset.startsWith('-') ? -1 : 1
  return sign * (hours * 60 + minutes)
}

export function toSearchFields(form) {
  const fields = Object.fromEntries(
    Object.entries(form).map(([name, value]) => [name, String(value ?? '').trim()]),
  )
  if ('symbol' in fields) fields.symbol = fields.symbol.toUpperCase()
  if ('from' in fields) fields.from = toNewYorkInstant(fields.from)
  if ('to' in fields) fields.to = toNewYorkInstant(fields.to)

  return fields
}

export function filterChips(form) {
  return Object.entries(form)
    .map(([name, value]) => ({ name, value: String(value ?? '').trim() }))
    .filter(({ name, value }) => value && name in FIELD_LABELS)
    .map(({ name, value }) => ({ name, label: `${FIELD_LABELS[name]}: ${chipValue(name, value)}` }))
}

export function exampleSearches(now) {
  const today = newYorkDate(now)

  return [
    { label: 'rebalance', form: { keyword: 'rebalance' } },
    { label: '"tax loss"', form: { keyword: '"tax loss"' } },
    {
      label: 'TSLA · Sells today',
      form: { symbol: 'TSLA', side: 'S', from: `${today}T00:00` },
    },
    {
      label: 'Account 1234 · last 7 days',
      form: { account: '1234', from: `${daysBefore(today, LAST_7_DAYS_BACK)}T00:00` },
    },
  ]
}

function chipValue(name, value) {
  if (name === 'side') return SIDE_NAMES[value] ?? value
  if (name === 'from' || name === 'to') return value.replace('T', ' ')
  return value
}

function newYorkDate(moment) {
  return NEW_YORK_DATE_FORMAT.format(moment)
}

function daysBefore(isoDate, days) {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) - days * DAY_MS).toISOString().slice(0, 10)
}
