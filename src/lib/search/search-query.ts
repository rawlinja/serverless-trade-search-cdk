import type { Db, SqlParams, SqlRow, SqlValue } from '@lib/database/db'
import type { Side, Trade } from '@lib/trades/trade'
import { encodeCursor } from './cursor'
import type { SearchParams } from './search-params'

export type StoredTrade = Trade & { id: number }
export type SearchPage = { items: StoredTrade[]; nextCursor: string | null }
export type SearchQuery = { sql: string; params: SqlParams }

const SELECT_TRADES = `select id, account, advisor, symbol,
  (extract(epoch from traded_at) * 1000)::bigint as traded_at_ms,
  side, qty, price::text as price, notes
from trading_activity_reports`
const NEWEST_FIRST = 'order by traded_at desc, id desc'

class Conditions {
  readonly clauses: string[] = []
  readonly params: SqlParams = {}

  add(clause: string, values: Record<string, SqlValue | undefined>): void {
    if (Object.values(values).some((value) => value === undefined)) return
    this.clauses.push(clause)
    Object.assign(this.params, values)
  }

  toWhere(): string {
    return this.clauses.length > 0 ? `where ${this.clauses.join('\n  and ')}\n` : ''
  }
}

export function buildSearchQuery(search: SearchParams): SearchQuery {
  const conditions = new Conditions()
  conditions.add('account = :account::text', { account: search.account })
  conditions.add('advisor = :advisor::text', { advisor: search.advisor })
  conditions.add('symbol = :symbol::text', { symbol: search.symbol })
  conditions.add('side = :side::text', { side: search.side })
  conditions.add('traded_at >= :from::timestamptz', { from: search.from })
  conditions.add('traded_at <= :to::timestamptz', { to: search.to })
  conditions.add('qty >= :qtyMin::integer', { qtyMin: search.qtyMin })
  conditions.add('qty <= :qtyMax::integer', { qtyMax: search.qtyMax })
  conditions.add('price >= :priceMin::numeric', { priceMin: search.priceMin })
  conditions.add('price <= :priceMax::numeric', { priceMax: search.priceMax })
  conditions.add("notes_tsv @@ websearch_to_tsquery('english', :keyword::text)", {
    keyword: search.keyword,
  })
  conditions.add('(traded_at, id) < (:cursorTradedAt::timestamptz, :cursorId::bigint)', {
    cursorTradedAt: search.cursor?.tradedAt,
    cursorId: search.cursor?.id,
  })

  return {
    sql: `${SELECT_TRADES}\n${conditions.toWhere()}${NEWEST_FIRST}\nlimit :limit::integer`,
    params: { ...conditions.params, limit: search.limit + 1 },
  }
}

export function toSearchPage(rows: SqlRow[], limit: number): SearchPage {
  const items = rows.slice(0, limit).map(toStoredTrade)
  const last = items.at(-1)
  const hasNextPage = rows.length > limit && last !== undefined

  return {
    items,
    nextCursor: hasNextPage ? encodeCursor({ tradedAt: last.tradedAt, id: last.id }) : null,
  }
}

export async function searchTrades(db: Db, search: SearchParams): Promise<SearchPage> {
  const { sql, params } = buildSearchQuery(search)
  return toSearchPage(await db.execute(sql, params), search.limit)
}

function toStoredTrade(row: SqlRow): StoredTrade {
  return {
    id: Number(row.id),
    account: String(row.account),
    advisor: String(row.advisor),
    symbol: String(row.symbol),
    tradedAt: new Date(Number(row.traded_at_ms)).toISOString(),
    side: row.side as Side,
    qty: Number(row.qty),
    price: String(row.price),
    notes: typeof row.notes === 'string' ? row.notes : null,
  }
}
