export type SqlValue = string | number | boolean | null
export type SqlParams = Record<string, SqlValue>
export type SqlRow = Record<string, SqlValue>

export interface Db {
  execute(sql: string, params?: SqlParams): Promise<SqlRow[]>
}
