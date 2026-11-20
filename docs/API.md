# Search API

`GET /search` returns trades from every loaded report, newest first, filtered by any combination of the parameters below. It is the only endpoint.

- **Base URL:** the `SearchApiUrl` output of the `TradeSearchSearchApi` stack, also stored in SSM at `/trade-search/search-api/url`.
- **Authentication:** none. The API is public and protected only by throttling.
- **Throttling:** 10 requests per second, burst 20, across all callers.
- **CORS:** any origin, `GET` only; `Retry-After` is exposed to browsers.

```bash
API_URL=$(aws ssm get-parameter --name /trade-search/search-api/url \
  --query Parameter.Value --output text)

curl -s "$API_URL/search?symbol=TSLA&side=B&limit=5"
```

## Parameters

Every parameter is optional; with none, the API returns the newest 50 trades. Filters combine with AND. Blank values are ignored, and surrounding whitespace is trimmed.

| Parameter   | Type         | Match                                                              |
| ----------- | ------------ | ------------------------------------------------------------------ |
| `account`   | text         | exact, case-sensitive                                              |
| `advisor`   | text         | exact, case-sensitive                                              |
| `symbol`    | text         | exact, case-sensitive (`TSLA`, not `tsla`)                         |
| `side`      | `B` or `S`   | exact                                                              |
| `from`      | timestamp    | trades at or after this instant                                    |
| `to`        | timestamp    | trades at or before this instant                                   |
| `qty_min`   | whole number | quantity at least this, up to 2147483647                           |
| `qty_max`   | whole number | quantity at most this, up to 2147483647                            |
| `price_min` | decimal      | price at least this                                                |
| `price_max` | decimal      | price at most this                                                 |
| `keyword`   | text         | words in the trade notes; see [Keyword search](#keyword-search)    |
| `limit`     | whole number | page size, 1–500, default 50                                       |
| `cursor`    | text         | `nextCursor` from the previous page; see [Pagination](#pagination) |

- **Timestamps** are ISO 8601 with a time and a time zone: `2026-11-07T09:30:00-05:00`, `2026-11-07T14:30Z`, `2026-11-07T14:30:00.123Z`. A bare date such as `2026-11-07` is rejected.
- **Decimals** are digits with an optional fractional part (`250`, `250.5`). Signs and exponents are rejected.
- **Unknown parameters** are rejected, so a misspelt filter fails loudly instead of being ignored.

### Keyword search

`keyword` uses PostgreSQL web search syntax against the notes, matched by English stem, up to 200 characters.

| Query                    | Matches notes that contain           |
| ------------------------ | ------------------------------------ |
| `harvest`                | `harvest`, `harvesting`, `harvested` |
| `harvest trimming`       | both words                           |
| `harvest OR trimming`    | either word                          |
| `"quarterly allocation"` | the phrase                           |
| `rebalance -tsla`        | `rebalance` but not `tsla`           |

Stems don't always line up: `rebalance` matches "REBALANCE" but not "Rebalancing". URL-encode the value, for example with `curl --get --data-urlencode 'keyword="quarterly allocation"'`.

## Response

`200 OK` with `content-type: application/json`:

```json
{
  "items": [
    {
      "id": 1042,
      "account": "1234",
      "advisor": "JD1",
      "symbol": "TSLA",
      "tradedAt": "2026-11-07T14:30:00.000Z",
      "side": "B",
      "qty": 100,
      "price": "248.1500",
      "notes": "Rebalancing toward TSLA"
    }
  ],
  "nextCursor": "eyJ0cmFkZWRBdCI6IjIwMjYtMTEtMDdUMTQ6MzA6MDAuMDAwWiIsImlkIjoxMDQyfQ"
}
```

| Field      | Type           | Notes                                                                  |
| ---------- | -------------- | ---------------------------------------------------------------------- |
| `id`       | number         | unique per trade                                                       |
| `account`  | string         |                                                                        |
| `advisor`  | string         |                                                                        |
| `symbol`   | string         |                                                                        |
| `tradedAt` | string         | UTC, ISO 8601 with milliseconds; reports record New York time          |
| `side`     | `"B"` or `"S"` |                                                                        |
| `qty`      | number         | positive whole number                                                  |
| `price`    | string         | four decimal places, kept as a string to avoid floating-point rounding |
| `notes`    | string or null |                                                                        |

Items are ordered by `tradedAt` descending, then `id` descending. An empty result is `{ "items": [], "nextCursor": null }`.

## Pagination

When more trades match, `nextCursor` holds an opaque string; pass it back as `cursor` with the same filters to get the next page. `nextCursor` is `null` on the last page.

```bash
curl -s --get "$API_URL/search" --data-urlencode 'symbol=TSLA' --data-urlencode "cursor=$NEXT"
```

Pages are keyset-based: a cursor marks a position in the newest-first order rather than an offset, so reports loaded while you page don't shift or repeat results. Trades newer than the first page appear when you start again without a cursor.

## Errors

| Status | When                                        | Body                                                         |
| ------ | ------------------------------------------- | ------------------------------------------------------------ |
| `400`  | one or more parameters are invalid          | `{ "error": "invalid search parameters", "details": [...] }` |
| `429`  | the throttle limit is exceeded              | API Gateway's response                                       |
| `500`  | an unexpected server error                  | API Gateway's response                                       |
| `503`  | the database is resuming from an idle pause | `{ "error": "database resuming" }`, header `Retry-After: 5`  |

A `400` lists every problem at once:

```json
{
  "error": "invalid search parameters",
  "details": [
    "unknown parameter ticker",
    "side must be B or S",
    "from must be an ISO 8601 timestamp with a time zone",
    "limit must be between 1 and 500"
  ]
}
```

Other `details` messages:

- `qty_min must be a whole number`, `qty_min must be at most 2147483647` (likewise `qty_max`)
- `limit must be a whole number`
- `price_min must be a decimal number` (likewise `price_max`)
- `keyword must be at most 200 characters`
- `from must not be after to`
- `cursor is invalid`

The database pauses after a period without queries. The first search after a pause waits up to 10 seconds for it to resume and returns `503` if it is still resuming; retry after the `Retry-After` interval.
