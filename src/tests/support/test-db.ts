import pg from 'pg'
import { PgDb } from '@lib/database/pg-db'

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:54329/trades'

const TRUNCATE_ALL =
  'truncate ingested_lines, trading_activity_reports, ingestion_runs restart identity cascade'

export function connectTestDb() {
  const pool = new pg.Pool({ connectionString: TEST_DATABASE_URL })

  return {
    db: new PgDb(pool),
    pool,
    reset: async () => {
      await pool.query(TRUNCATE_ALL)
    },
    close: () => pool.end(),
  }
}
