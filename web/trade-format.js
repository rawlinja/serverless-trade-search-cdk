const NEW_YORK_TIME_ZONE = 'America/New_York'
const TIME_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
})
const DATE_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: NEW_YORK_TIME_ZONE,
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const PRICE_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
})
const QUANTITY_FORMAT = new Intl.NumberFormat('en-US')
const SIDE_LABELS = { B: 'Buy', S: 'Sell' }

export function formatTradeTime(instant) {
  const moment = new Date(instant)

  return {
    time: plainSpaces(TIME_FORMAT.format(moment)),
    date: plainSpaces(DATE_FORMAT.format(moment)),
  }
}

export function formatPrice(price) {
  return PRICE_FORMAT.format(Number(price))
}

export function formatQuantity(qty) {
  return QUANTITY_FORMAT.format(qty)
}

export function sideLabel(side) {
  return SIDE_LABELS[side]
}

function plainSpaces(text) {
  return text.replace(/\s/g, ' ')
}
