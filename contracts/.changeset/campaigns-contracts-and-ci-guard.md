---
"@goodparty_org/contracts": minor
---

Add Campaigns module schemas, UpdateUserInput schema, PaginationOptions schema, and CI path-based publish guard.

- Add Campaign Zod schema, ReadCampaignOutput, ListCampaignsPagination, UpdateCampaignM2M schemas
- Add non-Prisma campaign enums (BallotReadyPositionLevel, ElectionLevel, CampaignLaunchStatus, etc.)
- Add Campaign JSON column types (CampaignDetails, CampaignData, CampaignAiContent and sub-types)
- Add UpdateUserInput schema derived from CreateUserInput
- Add UserMetaData inferred type export
- Add PaginationOptions schema for generic sortable pagination
- Generate Campaign scalar fields from Prisma DMMF for sort key derivation
- Guard RC and stable publish steps with dorny/paths-filter to only publish when contracts source files change
- Delete redundant gp-api wrapper schema files that only re-exported from contracts
- Wire all gp-api consumers to import directly from @goodparty_org/contracts
