const ISO_INSTANT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/

export function isInstant(value: string): boolean {
  if (!ISO_INSTANT_PATTERN.test(value)) return false

  try {
    Temporal.Instant.from(value)
    return true
  } catch {
    return false
  }
}

export function isAfter(instant: string, other: string): boolean {
  return Temporal.Instant.compare(Temporal.Instant.from(instant), Temporal.Instant.from(other)) > 0
}
