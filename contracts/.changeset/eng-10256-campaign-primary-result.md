---
'@goodparty_org/contracts': minor
---

Add top-level `primaryResult` (`'won' | 'lost'`, nullable) to `CampaignSchema`
/ `ReadCampaignOutput`. Persists a candidate's primary-election outcome as a
proper campaign column instead of the `details` JSON blob, so the dashboard's
Election Results selection survives reloads. Readers can access
`campaign.primaryResult` directly.
