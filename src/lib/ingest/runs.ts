import type { Db } from '@lib/database/db'
import type { RejectedLine } from '@lib/trades/trade'

export type RunStatus = 'processing' | 'succeeded' | 'failed'
export type RunSummary = { id: number; etag: string; status: RunStatus; tradesIngested: number }

export async function findRuns(db: Db, sourceKey: string): Promise<RunSummary[]> {
  const rows = await db.execute(
    `select id, etag, status, rows_ingested from ingestion_runs
     where source_key = :sourceKey::text order by id`,
    { sourceKey },
  )

  return rows.map((row) => ({
    id: Number(row.id),
    etag: String(row.etag),
    status: row.status as RunStatus,
    tradesIngested: Number(row.rows_ingested),
  }))
}

export async function startRun(db: Db, sourceKey: string, etag: string): Promise<number> {
  const [row] = await db.execute(
    `insert into ingestion_runs (source_key, etag, status, attempts, started_at)
     values (:sourceKey::text, :etag::text, 'processing', 1, now())
     on conflict (source_key, etag) do update
       set status = 'processing',
           attempts = ingestion_runs.attempts + 1,
           started_at = now(),
           finished_at = null
     returning id`,
    { sourceKey, etag },
  )
  return Number(row.id)
}

export async function completeRun(
  db: Db,
  runId: number,
  rowsRejected: number,
  errors: RejectedLine[],
): Promise<void> {
  await db.execute(
    `update ingestion_runs
     set status = 'succeeded', rows_rejected = :rowsRejected::integer,
         errors = :errors::jsonb, finished_at = now()
     where id = :runId::bigint`,
    { runId, rowsRejected, errors: JSON.stringify(errors) },
  )
}

export async function failRun(db: Db, runId: number, message: string): Promise<void> {
  await db.execute(
    `update ingestion_runs
     set status = 'failed', errors = :errors::jsonb, finished_at = now()
     where id = :runId::bigint`,
    { runId, errors: JSON.stringify([{ message }]) },
  )
}

export async function recordRejectedReport(
  db: Db,
  sourceKey: string,
  etag: string,
  message: string,
): Promise<void> {
  await db.execute(
    `insert into ingestion_runs (source_key, etag, status, attempts, errors, started_at, finished_at)
     values (:sourceKey::text, :etag::text, 'failed', 1, :errors::jsonb, now(), now())
     on conflict (source_key, etag) do update
       set status = 'failed',
           attempts = ingestion_runs.attempts + 1,
           errors = excluded.errors,
           finished_at = now()`,
    { sourceKey, etag, errors: JSON.stringify([{ message }]) },
  )
}
