# Voters Module

Voter data layer. Talks to L2 (commercial voter file vendor) for live counts/filtering and persists per-campaign voter file filters used by outreach. Owns the `VoterFileFilter` model and the voter-file download access flow.

This module does not store the voter file itself — L2 is the source of truth. We persist filters, derived counts, and audit metadata.

## Key files

| Path                                  | Purpose                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `voters.module.ts`                    | Module wiring; exports `VoterFileService`, `VotersService`, `VoterFileFilterService`, `VoterDatabaseService` |
| `voterFile/voterFile.controller.ts`   | HTTP: list/create/update/delete `VoterFileFilter`, request downloads                                         |
| `voterFile/voterFile.service.ts`      | CRUD on `VoterFileFilter`, download URL signing                                                              |
| `services/voters.service.ts`          | L2 API client (counts, demographic breakdowns)                                                               |
| `services/voterDatabase.service.ts`   | Direct queries against the in-house voter database                                                           |
| `services/voterFileFilter.service.ts` | Filter persistence + per-campaign filter listing                                                             |
| `services/voterOutreach.service.ts`   | Bridges voter filters to outreach campaigns                                                                  |
| `schemas/`                            | Zod input schemas for filter create/update                                                                   |
| `voters.types.ts`                     | `VoterCounts`, `EthnicityCounts`, `GenderCounts`, `PartisanCounts`, `VoterHistoryColumn`                     |

## Patterns

- **L2 is the system of record for voters.** Treat `VotersService` as a thin axios wrapper — never cache L2 responses in our DB beyond the explicit count snapshots on `VoterFileFilter`.
- **`L2_DATA_KEY` is required at boot** (`voters.service.ts` throws on missing env). Don't add lazy fallbacks.
- **Voter file downloads are gated** through `VoterFileDownloadAccessService` (in `src/shared/services/`) — it checks campaign tier + entitlement. Don't bypass it from new endpoints.
- Filters are scoped to a campaign via `@UseCampaign()` + `@ReqCampaign()` — same pattern as the rest of the campaign-scoped surface.

## Gotchas

- `VoterDatabaseService` and `VotersService` look similar but query different sources: the former hits our Postgres, the latter hits L2's HTTP API. Pick deliberately.
- The L2 API has its own rate limits and timeouts; wrap new calls in `try/catch` and throw `BadGatewayException` per `.cursor/rules/rules.mdc` Rule 3.
- Counts surfaced to the UI come from L2 in real time and may shift between page loads — don't rely on them for billing or quota math.
- `VotersModule` imports `OutreachModule` (one-way). If you find yourself wanting `OutreachModule` to import voters too, route the dependency through an existing service instead — adding a back-edge will require `forwardRef` and is a smell.
