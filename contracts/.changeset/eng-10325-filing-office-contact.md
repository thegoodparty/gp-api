---
'@goodparty_org/contracts': minor
---

`RaceTargetMetricsSchema` / `RaceTargetMetrics` gain three nullable
filing-office-contact fields, sourced from BallotReady via election-api's
`/races/by-br-hash-id/:hash/filing-fee` lookup:

- `filingOfficeAddress` — free-text address block (line 1/2, city, state, zip)
  where candidacy paperwork is submitted.
- `filingPhoneNumber` — phone for the local election authority.
- `paperworkInstructions` — BallotReady's narrative on the local election
  authority a candidate contacts for filing procedures.

All `null` when BallotReady has no office data for the race. Powers the
"filing office" block on the Pro-upgrade filing-instructions screen
(ENG-10325). Additive and non-breaking — existing consumers are unaffected.
