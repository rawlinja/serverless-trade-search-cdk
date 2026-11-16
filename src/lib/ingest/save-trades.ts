import type { Db } from '@lib/database/db'
import type { ReportLine } from '@lib/trades/trade'

const SAVE_TRADES_STATEMENT = `
with batch as (
  select r.*, nextval(pg_get_serial_sequence('trading_activity_reports', 'id')) as trade_id
  from jsonb_to_recordset(:rows::jsonb) as r(
    source_line int, account text, advisor text, symbol text,
    traded_at timestamptz, side char(1), qty int, price numeric, notes text)
),
claimed as (
  insert into ingested_lines (run_id, source_line, trade_id)
  select :runId::bigint, source_line, trade_id from batch
  on conflict (run_id, source_line) do nothing
  returning trade_id
),
inserted as (
  insert into trading_activity_reports
    (id, account, advisor, symbol, traded_at, side, qty, price, notes)
  select b.trade_id, b.account, b.advisor, b.symbol, b.traded_at, b.side, b.qty, b.price, b.notes
  from batch b join claimed c using (trade_id)
  returning id
)
update ingestion_runs
set rows_ingested = rows_ingested + (select count(*) from inserted)
where id = :runId::bigint`

export async function saveTrades(db: Db, runId: number, lines: ReportLine[]): Promise<void> {
  await db.execute(SAVE_TRADES_STATEMENT, { runId, rows: JSON.stringify(lines.map(toRecord)) })
}

function toRecord({ line, trade }: ReportLine) {
  return {
    source_line: line,
    account: trade.account,
    advisor: trade.advisor,
    symbol: trade.symbol,
    traded_at: trade.tradedAt,
    side: trade.side,
    qty: trade.qty,
    price: trade.price,
    notes: trade.notes,
  }
}
