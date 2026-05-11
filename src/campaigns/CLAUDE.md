# Campaigns Module

The core domain entity. A `Campaign` is the per-candidate workspace that hangs off an `Organization` (1:1) and owns plans, tasks, positions, AI-generated content, TCR/SMS compliance, and update history. Most other modules (websites, voters, payments, outreach) reference a campaign as their unit of work.

This module is `@Global` — `CampaignsService` is available without re-importing.

## Key files

| Path                                       | Purpose                                                         |
| ------------------------------------------ | --------------------------------------------------------------- |
| `campaigns.module.ts`                      | `@Global()`, wires submodule services and re-exports            |
| `campaigns.controller.ts`                  | HTTP for campaigns + nested route groups under `/campaigns/*`   |
| `services/campaigns.service.ts`            | Core CRUD on `Campaign`, slug build, list/pagination            |
| `services/campaignPlanVersions.service.ts` | Append-only history of campaign plan JSON snapshots             |
| `services/crmCampaigns.service.ts`         | Sync staff-managed campaigns to/from HubSpot                    |
| `ai/`                                      | LLM-driven plan/copy generation (`campaignsAi.module.ts`)       |
| `tasks/`                                   | Weekly tasks digest, task generation, legacy task controllers   |
| `tcrCompliance/`                           | TCR brand/campaign registration for Peerly SMS sending          |
| `positions/`                               | Race positions a campaign is running for                        |
| `updateHistory/`                           | User-facing `CampaignUpdateHistory` (per-field audit log)       |
| `decorators/`                              | `@ReqCampaign()`, `@UseCampaign()` — load campaign onto request |
| `guards/`                                  | Campaign-scoped access guards                                   |
| `campaigns.types.ts`                       | `CampaignWith<...>` helpers for Prisma includes                 |

## Patterns

- **Sub-feature directories own their own controller/service/schemas** (`tasks/`, `tcrCompliance/`, `positions/`, `updateHistory/`). They are wired into `CampaignsModule`, not registered as separate Nest modules — keep them inside this module unless they grow third-party deps.
- **`@UseCampaign()` + `@ReqCampaign()`** is the standard way to scope a route to "the current user's campaign". Don't pull `campaignId` out of the body — read the campaign off the request.
- **Plan versions are append-only.** Treat `campaignPlanVersions` as event-sourced; never UPDATE an existing row, always INSERT a new version.
- The `Campaign.data`, `details`, and `aiContent` columns are `Json` with typed `.jsonTypes.d.ts` shadows. New fields belong in **proper columns**, not these blobs (Rule 25 in `.cursor/rules/rules.mdc`).

## Gotchas

- Module is `@Global` — adding a service here exposes it app-wide. Don't re-export from another module.
- `WebsitesModule` uses `forwardRef(() => CampaignsModule)` to break a cycle (campaigns imports `WebsitesModule` directly). Adding new cross-edges risks a circular-import surprise; prefer routing the dependency through `payments` or `organizations` if possible.
- `organizationSlug` is the foreign key, not `organizationId`. Cascade-delete is on the slug.
- Several services here import from `@goodparty_org/contracts` (e.g. `CampaignLaunchStatus`). When changing those enums, follow `docs/contracts.md` — the SDK and `gp-admin` consume them.
