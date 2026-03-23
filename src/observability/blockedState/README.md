# BlockedState tracking (gp-api)

## What gets emitted

### Custom event: `BlockedState`

Emitted when an **authenticated** user hits a known “blocked state” proxy in gp-api.

#### v1 criteria

- Any authenticated request that results in **HTTP >= 500**
- Plus a small allowlist of known “data integrity” 4xx errors (**by `errorCode`**), currently:
  - `DATA_INTEGRITY_P2V_ELECTION_INFO_MISSING`
  - `DATA_INTEGRITY_CAMPAIGN_DETAILS_MISSING`
  - `DATA_INTEGRITY_CAMPAIGN_STATE_INVALID`
  - `BILLING_CUSTOMER_ID_MISSING`
  - `BILLING_DOMAIN_PAYMENT_ID_MISSING`

#### Background failures (no HTTP request)

We also emit `BlockedState` for known background hard failures, starting with **P2V marked failed**.

## Event schema (minimum)

Attributes recorded on `BlockedState`:

- `service`: `gp-api`
- `environment`: `process.env.NODE_ENV`
- `userId`: number
- `endpoint`: string (HTTP events)
- `method`: string (HTTP events)
- `statusCode`: number (HTTP events)
- `errorClass`: string (HTTP events)
- `errorMessage`: string (HTTP events, no PII)
- `errorCode`: string | number | null (HTTP events, when present)
- `rootCause`: string bucket
- `isBackground`: boolean
- optional: `campaignId`, `slug`, `feature`

## Denominator support (active users)

Transactions are tagged with `userId` for authenticated requests so we can query unique active users in New Relic.

## NRQL snippets

### Numerator: unique blocked users

`SELECT uniqueCount(userId) FROM BlockedState SINCE 1 week ago`

### Denominator: unique active (authenticated) users

`SELECT uniqueCount(userId) FROM Transaction WHERE userId IS NOT NULL SINCE 1 week ago`

### Top offenders

- `SELECT count(*) FROM BlockedState FACET endpoint SINCE 1 week ago`
- `SELECT count(*) FROM BlockedState FACET rootCause SINCE 1 week ago`
- `SELECT count(*) FROM BlockedState FACET statusCode SINCE 1 week ago`
