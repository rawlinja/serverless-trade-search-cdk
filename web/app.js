import { exampleSearches, filterChips, toQueryString, toSearchFields } from './search-query.js'
import { searchFailureMessage } from './search-messages.js'
import { formatPrice, formatQuantity, formatTradeTime, sideLabel } from './trade-format.js'

const MAX_RESUME_RETRIES = 6
const DEFAULT_RETRY_AFTER_SECONDS = 5
const MAX_RETRY_AFTER_SECONDS = 30
const SEARCH_LABEL = 'Search'
const SEARCHING_LABEL = 'Searching…'
const LOAD_MORE_LABEL = 'Load more'
const LOADING_LABEL = 'Loading…'
const DATABASE_WAKING_UP = 'Database waking up, retrying…'
const NO_MATCHES = 'No trades match these filters'
const SIDE_PILL_CLASSES = { B: 'buy', S: 'sell' }

const form = document.querySelector('#search-form')
const searchButton = document.querySelector('#search-button')
const chips = document.querySelector('#chips')
const banner = document.querySelector('#banner')
const liveStatus = document.querySelector('#status')
const firstVisit = document.querySelector('#first-visit')
const examples = document.querySelector('#examples')
const noMatches = document.querySelector('#no-matches')
const clearFilters = document.querySelector('#clear-filters')
const resultList = document.querySelector('#result-list')
const resultRows = document.querySelector('#result-rows')
const tradeCount = document.querySelector('#trade-count')
const showing = document.querySelector('#showing')
const resultsCard = document.querySelector('#results-card')
const resultsFooter = document.querySelector('#results-footer')
const loadMore = document.querySelector('#load-more')
const panels = [firstVisit, noMatches, resultList]
const config = await fetch('config.json').then((response) => response.json())
let filters = {}
let nextCursor = null
let currentSearch = 0
let retryTimer

renderExamples()

form.addEventListener('submit', (event) => {
  event.preventDefault()
  let submission
  try {
    submission = readSubmission()
  } catch {
    showFailure(searchFailureMessage(null, null), null)
    return
  }

  clearTimeout(retryTimer)
  currentSearch += 1
  filters = submission.fields
  setField('symbol', filters.symbol)
  nextCursor = null
  renderChips({ ...submission.submitted, symbol: filters.symbol })
  hideBanner()
  search(currentSearch, null)
})
loadMore.addEventListener('click', () => search(currentSearch, nextCursor))
clearFilters.addEventListener('click', () => {
  form.reset()
  submitAndFocusKeyword()
})

function readSubmission() {
  const submitted = Object.fromEntries(new FormData(form))
  return { submitted, fields: toSearchFields(submitted) }
}

async function search(searchId, cursor, attempt = 0) {
  showInFlight(cursor)
  const response = await fetch(searchUrl(cursor)).catch(() => null)
  const body = await response?.json().catch(() => null)
  if (searchId !== currentSearch) return

  if (response?.status === 503 && attempt < MAX_RESUME_RETRIES) {
    showWaitingToRetry()
    showBanner('info', DATABASE_WAKING_UP)
    retryTimer = setTimeout(() => search(searchId, cursor, attempt + 1), retryAfterMs(response))
    return
  }

  showIdle()
  if (!response?.ok) {
    showFailure(searchFailureMessage(response?.status ?? null, body), cursor)
    return
  }
  try {
    showPage(body, cursor)
  } catch {
    showFailure(searchFailureMessage(null, body), cursor)
  }
}

function searchUrl(cursor) {
  return `${config.apiUrl}/search?${toQueryString(filters, cursor)}`
}

function retryAfterMs(response) {
  const seconds = Number(response.headers.get('retry-after')) || DEFAULT_RETRY_AFTER_SECONDS
  return Math.min(seconds, MAX_RETRY_AFTER_SECONDS) * 1000
}

function showInFlight(cursor) {
  if (cursor) showLoadingMore()
  else showSearching()
}

function showSearching() {
  searchButton.disabled = true
  searchButton.textContent = SEARCHING_LABEL
  loadMore.disabled = true
  loadMore.textContent = LOAD_MORE_LABEL
  announce(SEARCHING_LABEL)
}

function showLoadingMore() {
  loadMore.disabled = true
  loadMore.textContent = LOADING_LABEL
  announce(LOADING_LABEL)
}

function showWaitingToRetry() {
  searchButton.disabled = false
  searchButton.textContent = SEARCH_LABEL
  loadMore.disabled = true
}

function showIdle() {
  searchButton.disabled = false
  searchButton.textContent = SEARCH_LABEL
  loadMore.disabled = false
  loadMore.textContent = LOAD_MORE_LABEL
}

function showPage(page, cursor) {
  const rows = page.items.map(tradeRow)
  if (!cursor && rows.length === 0) {
    showPanel(noMatches)
    hideBanner()
    announce(NO_MATCHES)
    return
  }

  if (!cursor) resultRows.replaceChildren()
  resultRows.append(...rows)
  nextCursor = page.nextCursor
  resultsFooter.hidden = !nextCursor
  showCount(resultRows.rows.length)
  showPanel(resultList)
  hideBanner()
}

function showFailure(message, cursor) {
  if (!cursor) showPanel(null)
  showBanner('error', message)
}

function showCount(shown) {
  const count = formatQuantity(shown)
  tradeCount.textContent = shown === 1 ? `${count} trade` : `${count} trades`
  showing.textContent = `Showing 1–${count}`
  announce(tradeCount.textContent)
}

function showPanel(visible) {
  for (const panel of panels) panel.hidden = panel !== visible
  resultsCard.hidden = !visible
}

function showBanner(kind, message) {
  banner.className = `banner ${kind}`
  banner.textContent = message
  banner.hidden = false
  announce(message)
}

function hideBanner() {
  banner.hidden = true
  banner.textContent = ''
}

function announce(message) {
  liveStatus.textContent = message
}

function tradeRow(trade) {
  const row = document.createElement('tr')
  row.append(
    timeCell(trade.tradedAt),
    textCell(trade.account),
    textCell(trade.advisor),
    textCell(trade.symbol, 'symbol'),
    sideCell(trade.side),
    textCell(formatQuantity(trade.qty), 'number'),
    textCell(formatPrice(trade.price), 'number'),
    textCell(trade.notes ?? '', 'notes'),
  )
  return row
}

function timeCell(tradedAt) {
  const { time, date } = formatTradeTime(tradedAt)
  const cell = textCell('', 'trade-time')
  cell.append(element('strong', time), element('span', date))
  return cell
}

function sideCell(side) {
  const cell = textCell('')
  const pillClass = SIDE_PILL_CLASSES[side]
  cell.append(element('span', sideLabel(side), pillClass ? `pill ${pillClass}` : 'pill'))
  return cell
}

function textCell(text, className) {
  return element('td', text, className)
}

function element(tagName, text, className) {
  const node = document.createElement(tagName)
  node.textContent = String(text)
  if (className) node.className = className
  return node
}

function renderChips(submitted) {
  chips.replaceChildren(...filterChips(submitted).map(filterChip))
}

function filterChip({ name, label }) {
  const chip = element('button', label, 'chip')
  chip.type = 'button'
  chip.setAttribute('aria-label', `Remove filter ${label}`)
  const remove = element('span', '×', 'chip-remove')
  remove.setAttribute('aria-hidden', 'true')
  chip.append(remove)
  chip.addEventListener('click', () => {
    setField(name, '')
    submitAndFocusKeyword()
  })
  return chip
}

function renderExamples() {
  examples.replaceChildren(...exampleSearches(new Date()).map(exampleButton))
}

function exampleButton({ label, form: fields }) {
  const button = element('button', label, 'example-button')
  button.type = 'button'
  button.addEventListener('click', () => {
    form.reset()
    for (const [name, value] of Object.entries(fields)) setField(name, value)
    submitAndFocusKeyword()
  })
  return button
}

function submitAndFocusKeyword() {
  form.requestSubmit()
  form.elements.namedItem('keyword').focus()
}

function setField(name, value) {
  form.elements.namedItem(name).value = value
}
