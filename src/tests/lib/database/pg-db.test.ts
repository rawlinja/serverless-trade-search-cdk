import { describe, expect, it } from 'vitest'
import { toPositional } from '@lib/database/pg-db'

describe('toPositional', () => {
  it('numbers parameters in order of first use and reuses repeated names', () => {
    expect(toPositional('select :a, :b, :a', { a: 1, b: 'x' })).toEqual({
      text: 'select $1, $2, $1',
      values: [1, 'x'],
    })
  })

  it('leaves type casts alone', () => {
    expect(toPositional('select :rows::jsonb', { rows: '[]' })).toEqual({
      text: 'select $1::jsonb',
      values: ['[]'],
    })
  })

  it('leaves names that are not parameters untouched', () => {
    expect(toPositional("select 'a:b', :id", { id: 1 }).text).toBe("select 'a:b', $1")
  })
})
