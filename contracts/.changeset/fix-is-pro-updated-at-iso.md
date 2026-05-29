---
'@goodparty_org/contracts': minor
---

Widen `CampaignDetails.isProUpdatedAt` from `number` to `string | number`.
New writes from `gp-api` store an ISO datetime string; legacy unix-ms
numbers persist in existing rows until backfilled. Readers must handle
both shapes. The previously-valid `number` shape is unchanged.
