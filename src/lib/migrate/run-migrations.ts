import type { Db } from '@lib/database/db'
import { MIGRATIONS, type Migration } from './migrations'

const CREATE_MIGRATIONS_TABLE = `create table if not exists schema_migrations (
  id text primary key,
  applied_at timestamptz not null default now()
)`

export async function runMigrations(db: Db, pending: Migration[] = MIGRATIONS): Promise<string[]> {
  await db.execute(CREATE_MIGRATIONS_TABLE)
  const appliedRows = await db.execute('select id from schema_migrations')
  const applied = new Set(appliedRows.map((row) => String(row.id)))
  const toApply = pending.filter((migration) => !applied.has(migration.id))

  for (const migration of toApply) {
    for (const statement of migration.statements) await db.execute(statement)
    await db.execute('insert into schema_migrations (id) values (:id::text)', { id: migration.id })
  }

  return toApply.map((migration) => migration.id)
}
