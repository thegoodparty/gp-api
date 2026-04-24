---
'@goodparty_org/contracts': minor
---

Add enriched campaign response schemas for M2M campaign endpoints.

- `RaceTargetMetricsSchema` / `RaceTargetMetrics` — live race-target metrics shape (`winNumber`, `voterContactGoal`, `projectedTurnout`).
- `CampaignWithPositionNameSchema` / `CampaignWithPositionName` — `ReadCampaignOutput` extended with `positionName`. Used by `GET /v1/campaigns/list` (M2M) so admins can render the human-readable position without a per-row roundtrip.
- `CampaignWithLiveContextSchema` / `CampaignWithLiveContext` — `CampaignWithPositionName` further extended with `raceTargetMetrics` (nullable). Used by `GET /v1/campaigns/:id` (M2M).

These centralize the shapes that `gp-api` returns and `gp-sdk` consumes, replacing the previously duplicated local definitions in both repos.
