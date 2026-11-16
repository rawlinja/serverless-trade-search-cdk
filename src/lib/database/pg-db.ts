import pg from 'pg'
import type { Db, SqlParams, SqlRow, SqlValue } from './db'

const INT8_TYPE_ID = 20
const NAMED_PARAM_PATTERN = /(?<!:):([a-zA-Z_]\w*)/g

pg.types.setTypeParser(INT8_TYPE_ID, Number)

export class PgDb implements Db {
  constructor(private readonly pool: pg.Pool) {}

  async execute(sql: string, params: SqlParams = {}): Promise<SqlRow[]> {
    const { text, values } = toPositional(sql, params)
    const result = await this.pool.query(text, values)
    return result.rows
  }
}

export function toPositional(sql: string, params: SqlParams): { text: string; values: SqlValue[] } {
  const names: string[] = []

  const text = sql.replace(NAMED_PARAM_PATTERN, (match, name: string) => {
    if (!(name in params)) return match
    if (!names.includes(name)) names.push(name)
    return `$${names.indexOf(name) + 1}`
  })

  return { text, values: names.map((name) => params[name]) }
}
