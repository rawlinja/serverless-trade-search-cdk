import { isInstant } from './instant'

export type Cursor = { tradedAt: string; id: number }

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url')
}

export function decodeCursor(raw: string): Cursor | null {
  const value = parseJson(Buffer.from(raw, 'base64url').toString('utf8'))
  return isCursor(value) ? { tradedAt: value.tradedAt, id: value.id } : null
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function isCursor(value: unknown): value is Cursor {
  if (typeof value !== 'object' || value === null) return false

  const { tradedAt, id } = value as Record<string, unknown>
  return (
    typeof tradedAt === 'string' &&
    isInstant(tradedAt) &&
    typeof id === 'number' &&
    Number.isSafeInteger(id) &&
    id > 0
  )
}
