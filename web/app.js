import { toQueryString, toSearchFields } from './search-query.js'
import { formatTradeTime } from './trade-format.js'

const MAX_RESUME_RETRIES = 6
const DEFAULT_RETRY_AFTER_SECONDS = 5

const form = document.querySelector('#search-form')
const status = document.querySelector('#status')
const results = document.querySelector('#results tbody')
const loadMore = document.querySelector('#load-more')
const config = await fetch('config.json').then((response) => response.json())
let filters = {}
let nextCursor = null
let currentSearch = 0
let retryTimer

form.addEventListener('submit', (event) => {
  event.preventDefault()
  clearTimeout(retryTimer)
  currentSearch += 1
  filters = readFilters()
  results.replaceChildren()
  nextCursor = null
  loadMore.hidden = true
  search(currentSearch, null)
})
loadMore.addEventListener('click', () => search(currentSearch, nextCursor))

async function search(searchId, cursor, attempt = 0) {
  loadMore.disabled = true
  status.textContent = 'Searching…'
  const response = await fetch(searchUrl(cursor)).catch(() => null)
  const body = await response?.json().catch(() => ({}))
  if (searchId !== currentSearch) return

  if (response?.status === 503 && attempt < MAX_RESUME_RETRIES) {
    status.textContent = 'Database waking up, retrying…'
    retryTimer = setTimeout(() => search(searchId, cursor, attempt + 1), retryAfterMs(response))
    return
  }

  loadMore.disabled = false
  if (!response) {
    status.textContent = 'Search failed: network error'
    return
  }
  if (!response.ok) {
    status.textContent =
      body.details?.join('; ') ?? body.error ?? `Search failed (${response.status})`
    return
  }

  appendRows(body.items)
  nextCursor = body.nextCursor
  loadMore.hidden = !nextCursor
  status.textContent = `${results.rows.length} trades shown`
}

function readFilters() {
  const fields = Object.fromEntries(new FormData(form))
  return toSearchFields(fields)
}

function searchUrl(cursor) {
  return `${config.apiUrl}/search?${toQueryString(filters, cursor)}`
}

function retryAfterMs(response) {
  const seconds = Number(response.headers.get('retry-after')) || DEFAULT_RETRY_AFTER_SECONDS
  return seconds * 1000
}

function appendRows(trades) {
  for (const trade of trades) {
    const row = results.insertRow()
    const { date, time } = formatTradeTime(trade.tradedAt)
    const cells = [
      `${date} ${time}`,
      trade.account,
      trade.advisor,
      trade.symbol,
      trade.side,
      trade.qty,
      trade.price,
      trade.notes ?? '',
    ]
    for (const value of cells) row.insertCell().textContent = String(value)
  }
}
