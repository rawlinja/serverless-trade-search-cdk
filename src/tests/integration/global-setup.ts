import { runMigrations } from '@lib/migrate/run-migrations'
import { connectTestDb } from '../support/test-db'

export default async function setup(): Promise<void> {
  const { db, pool, close } = connectTestDb()
  await pool.query('drop schema public cascade')
  await pool.query('create schema public')
  await runMigrations(db)
  await close()
}
