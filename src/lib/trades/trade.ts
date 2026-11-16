export type Side = 'B' | 'S'

export type Trade = {
  account: string
  advisor: string
  symbol: string
  tradedAt: string
  side: Side
  qty: number
  price: string
  notes: string | null
}

export type ReportLine = { line: number; trade: Trade }

export type RejectedLine = { line: number; message: string }

export const MAX_QTY = 2_147_483_647
