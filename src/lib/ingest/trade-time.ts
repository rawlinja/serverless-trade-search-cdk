const NEW_YORK_TIME_ZONE = 'America/New_York'
const KEY_DATE_PATTERN = /(?:^|\/)(\d{4}-\d{2}-\d{2})\//
// Strict, because Temporal would clamp a leap second such as 09:30:60 to 09:30:59.
const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,3})?$/

export function tradeDateFromKey(key: string): string | null {
  const date = KEY_DATE_PATTERN.exec(key)?.[1]
  if (!date) return null

  try {
    return Temporal.PlainDate.from(date).toString()
  } catch {
    return null
  }
}

export function toTradedAt(tradeDate: string, time: string): string | null {
  if (!TIME_OF_DAY_PATTERN.test(time)) return null

  const localTime = Temporal.PlainDate.from(tradeDate).toPlainDateTime(
    Temporal.PlainTime.from(time),
  )
  // A repeated fall-back time takes the earlier instant; a skipped spring-forward time shifts, so reject it.
  const zoned = localTime.toZonedDateTime(NEW_YORK_TIME_ZONE, { disambiguation: 'earlier' })
  if (!zoned.toPlainDateTime().equals(localTime)) return null

  return zoned.toInstant().toString({ smallestUnit: 'millisecond' })
}
