# Separating Win and Serve: Data Architecture Design

**Status:** Draft / RFC
**Author:** [your name]
**Date:** 2026-02-09
**Teams Affected:** Win (Candidates), Serve (Elected Officials), Platform/Infra

---

## 1. Problem Statement

Today, **Campaign** is the singular organizing entity across the entire GoodParty product. Every feature — voter data, outreach, websites, AI content, payments, district matching, P2V, analytics — is scoped to a Campaign record. A User effectively has one Campaign.

When we introduced the **ElectedOffice** concept (for the "Serve" product), we attached it to Campaign as a quick path to shipping. The schema itself acknowledges this with a comment:

> "temporary relationship to campaign — goal would be to move away from the hard link to campaign, but is necessary for now"
> — `prisma/schema/electedOffice.prisma:18-20`

We now need to:
1. Allow a user to have **both** a Campaign (Win) **and** an ElectedOffice (Serve) simultaneously
2. Support **multiple** campaigns and/or offices per user
3. Cleanly separate what "belongs to a campaign" vs. what "belongs to an elected office" vs. what's shared
4. Enable a top-level product switcher in the app (Win mode / Serve mode)

---

## 2. Current Architecture: Lay of the Land

### 2.1 Data Model Overview

```
User (1)
  ├── campaigns (1:many in schema, 1:1 in practice)
  │     └── Campaign
  │           ├── pathToVictory (1:1) — win numbers, district, turnout
  │           ├── website (1:1) — campaign website
  │           ├── campaignPlanVersion (1:1) — plan versioning
  │           ├── ecanvasser (1:1) — door knocking integration
  │           ├── tcrCompliance (1:1) — SMS compliance
  │           ├── topIssues, campaignPositions (1:many)
  │           ├── outreach (1:many) — voter outreach campaigns
  │           ├── voterFileFilters (1:many)
  │           ├── communityIssues (1:many)
  │           ├── scheduledMessages (1:many)
  │           ├── aiChats (1:many)
  │           ├── details (JSON) — office, district, ballotReady IDs, subscription info
  │           ├── data (JSON) — onboarding step, launch status
  │           ├── aiContent (JSON) — AI-generated campaign content
  │           ├── isPro (boolean) — subscription status
  │           └── electedOffices (1:many) ← temporary link
  │
  └── electedOffices (1:many)
        └── ElectedOffice
              ├── campaignId (FK to Campaign) ← the coupling we want to break
              ├── polls (1:many)
              ├── pollIndividualMessages (1:many)
              ├── term dates (elected, sworn in, start, end)
              └── isActive
```

### 2.2 Campaign as the Authorization Boundary

Campaign is not just a data model — it is the **authorization and scoping mechanism** for the entire API:

- **`@UseCampaign()` decorator + `UseCampaignGuard`** — Applied to 16+ controllers. Fetches the current user's campaign and attaches it to the request. If no campaign exists, the request is rejected.
- **`@ReqCampaign()`** — Parameter decorator that extracts campaign from `request.campaign`
- **`CampaignOwnerOrAdminGuard`** — Validates user owns the campaign or is admin

Every protected endpoint effectively requires `User → Campaign → [resource]` as its access chain.

### 2.3 Key Fields Currently on Campaign That Serve Both Products

| Field / Concept | Win (Candidates) | Serve (Officials) | Notes |
|---|---|---|---|
| `isPro` | Subscription status | Used as access gate for voter file | Payment tied to campaign |
| `details.positionId` | BallotReady position | Reused for official's position | Stored in campaign JSON |
| `details.ballotLevel` | Election level | Office level | Same field |
| `details.office` | Office running for | Office held | Same field, different semantics |
| `details.electionDate` | Upcoming election | N/A for serving | Candidates-only |
| `details.state/city/county` | Election geography | Serving geography | Often the same |
| `pathToVictory` | Win number + turnout | Not applicable | Campaign-only concept |
| `details.subscriptionId` | Stripe subscription | Could be separate | Currently campaign-scoped |
| Voter File access | Pro-gated | ElectedOffice-gated | Already diverged (see voterFile.controller.ts:137) |

### 2.4 Frontend Architecture

The frontend mirrors this coupling:

- **`CampaignProvider` / `useCampaign()`** — Global React context providing the single campaign. Fetches from `GET /campaigns/mine`.
- **`ElectedOfficeProvider` / `useElectedOffice()`** — Separate context, but fetches via `GET /elected-office/current` which still returns an office tied to a campaignId.
- **`DashboardMenu`** — Conditionally shows Serve features (Polls, Contacts) when `electedOffice` exists, but still operates within the campaign context.
- **`serveAccess()`** — Server-side redirect guard: if no elected office, redirect to `/dashboard`.
- **Feature flag `serve-access`** — Controls Serve feature visibility in the nav.
- **`campaign.isPro`** — Referenced in 20+ frontend files for feature gating.
- **API routes** — All campaign endpoints use `/campaigns/mine` (singular), assuming one campaign per user.

### 2.5 Integration Points Summary

| System | Campaign References | Impact |
|---|---|---|
| API Controllers | 16 controllers use `@UseCampaign()` | High — authorization boundary |
| API Services | 80+ files import Campaign | High — business logic |
| Database (FK) | 15+ tables have `campaignId` | High — schema migration |
| Queue/Jobs | All async jobs routed by `campaignId` | Medium — message routing |
| Payments (Stripe) | `campaignId` in checkout metadata | Medium — billing model |
| CRM (HubSpot) | Campaign-centric contact sync | Medium — CRM schema |
| Analytics | Campaign user identification | Low — tracking changes |
| Frontend Contexts | `CampaignProvider`, `ElectedOfficeProvider` | High — state management |
| Frontend Pages | 60+ files reference campaign | High — UI coupling |

---

## 3. Major Technical Subproblems

### Subproblem 1: Introduce a Shared Parent Entity (or Strategy)

**The core question:** What replaces Campaign as the universal organizing concept?

**Options to consider:**

**A) Introduce a "Seat" or "Position" abstraction** — A new model that represents "a user's relationship to a political position." Both Campaign and ElectedOffice become children of this entity. PathToVictory, district data, and BallotReady IDs attach to the Seat rather than the Campaign.

```
User
  └── Seat (new model)
        ├── Campaign? (optional — Win product)
        ├── ElectedOffice? (optional — Serve product)
        ├── pathToVictory (moved from Campaign)
        ├── districtData (currently in campaign.details JSON)
        └── ballotReadyPositionId, office, level, geography
```

**B) Let Campaign and ElectedOffice be fully independent peers** — Each has its own position/district data. Shared concepts (voter data, contacts, outreach) reference either a `campaignId` OR an `electedOfficeId`.

**C) Keep Campaign as-is but make ElectedOffice a first-class citizen** — Duplicate the necessary fields onto ElectedOffice and update all guards/services to accept either. This is the most incremental approach but risks permanent duplication.

**Recommendation:** Option A gives the cleanest long-term architecture. Option C is the fastest path for incremental delivery. The choice depends on how many shared fields truly need to be shared vs. duplicated.

### Subproblem 2: Redesign Authorization & Multi-Entity Scoping

**The problem:** `@UseCampaign()` is the only authorization decorator, used by 16 controllers. We need to support:
- Endpoints that require a Campaign specifically (e.g., AI campaign content)
- Endpoints that require an ElectedOffice specifically (e.g., polls, community issues)
- Endpoints that work with either (e.g., voter data, contacts, outreach)
- Endpoints that need to know which "mode" the user is in

**Changes needed:**
- New guard/decorator pattern: `@UseContext()` that resolves to either Campaign or ElectedOffice (or Seat) based on a header, query param, or session state
- Refactor `request.campaign` → `request.context` (or similar) across all controllers
- Multi-entity support: user selects which campaign/office they're operating in via the top-level switcher
- The "current" concept changes from "the one campaign" to "the selected campaign or office"

**Key files:**
- `src/campaigns/guards/UseCampaign.guard.ts`
- `src/campaigns/decorators/UseCampaign.decorator.ts`
- `src/campaigns/decorators/ReqCampaign.decorator.ts`

### Subproblem 3: Data Migration — Extracting Shared Concerns from Campaign

**The problem:** Campaign's JSON fields (`details`, `data`) contain a mix of candidate-specific, office-specific, and shared data. The `isPro` subscription status lives on Campaign but gates features for both products.

**Key extractions needed:**

1. **Position/Geography data** — `details.positionId`, `details.ballotLevel`, `details.office`, `details.state`, `details.city`, `details.county`, `details.district` — These describe a political position and should live on the shared entity (Seat) or be duplicated to ElectedOffice.

2. **Subscription/Billing** — `isPro`, `details.subscriptionId`, `details.isProUpdatedAt` — Should this move to User level? Or should each Campaign/Office have its own subscription? The `voterFile.controller.ts` already checks `campaign.isPro || hasElectedOffice` (line 137), suggesting subscription could become user-level or per-entity.

3. **PathToVictory** — Currently 1:1 with Campaign. Win numbers and voter contact goals are candidate-specific. For Serve, similar district/voter data might be needed but without the "win" framing. Consider whether P2V should attach to the shared entity or remain Campaign-only with a parallel "constituency profile" for ElectedOffice.

4. **Campaign.details field refactoring** — This JSON blob has 40+ optional fields mixing concerns. Regardless of the Win/Serve split, extracting these into proper columns or related tables would reduce fragility. At minimum, position-related fields should be separated.

**Migration approach:**
- Schema migration that creates new tables/columns
- Backfill script that copies data from `campaign.details` JSON into new locations
- Dual-read period where code checks both old and new locations
- Cleanup migration removing old fields

### Subproblem 4: Frontend State Management & Product Switcher

**The problem:** The frontend has a single `CampaignProvider` context that assumes one campaign per user. Adding a product switcher requires:

1. **Multi-entity state** — Replace the single `useCampaign()` with something that can hold multiple campaigns and offices, with a "selected" entity.

2. **Product switcher UI** — Top-level control for switching between Win and Serve mode. This sets which entity's data is loaded and which nav items are shown.

3. **Route structure** — Currently everything is under `/dashboard/*`. Consider:
   - `/dashboard/win/*` and `/dashboard/serve/*` prefixes
   - Or keep flat routes with mode state in context
   - Route guards that redirect if wrong mode

4. **API integration** — Frontend currently calls `/campaigns/mine` (singular). With multiple campaigns, it needs to specify which one: `/campaigns/:id` or pass context via header.

**Key frontend files:**
- `app/shared/hooks/CampaignProvider.tsx` — Needs multi-entity support
- `app/shared/hooks/ElectedOfficeProvider.tsx` — May merge into unified context
- `app/(candidate)/dashboard/shared/DashboardMenu.tsx` — Nav must be mode-aware
- `app/(candidate)/dashboard/shared/serveAccess.ts` — Access guard pattern
- `gpApi/routes.ts` — API route definitions need parameterization
- `helpers/types.ts` — Campaign interface needs updating

### Subproblem 5: Incremental Migration Strategy

**The problem:** This is a massive change touching 80+ services, 16 controllers, 15+ DB tables, and 60+ frontend files. It cannot be done in a single PR or sprint. We need a phased approach that:

- Maintains backward compatibility at each phase
- Allows Win and Serve teams to work independently
- Doesn't require a "big bang" deployment
- Minimizes risk to the production user base

**Proposed phases:**

**Phase 1: Foundation (No user-visible changes)**
- Create the new shared entity (Seat) or expand ElectedOffice with its own position/district fields
- Add new columns/tables alongside existing ones
- Write backfill scripts
- Add new guards/decorators that coexist with `@UseCampaign()`

**Phase 2: API Dual-Path Support**
- Update controllers to accept both campaign-scoped and office-scoped requests
- Introduce context header/param for multi-entity selection
- Frontend sends context identifier with requests
- Both old and new code paths work simultaneously

**Phase 3: Frontend Product Switcher**
- Introduce multi-entity state management
- Build the product switcher UI
- Update dashboard nav to be mode-aware
- Roll out behind feature flag

**Phase 4: ElectedOffice Independence**
- Remove `campaignId` FK from ElectedOffice
- ElectedOffice gets its own position/district/subscription data
- Serve features no longer require a Campaign to exist

**Phase 5: Cleanup**
- Remove dual-read code
- Drop deprecated columns/fields
- Remove old `@UseCampaign()` usage from Serve-only endpoints
- Clean up campaign.details JSON

---

## 4. Key Design Decisions Needed

| Decision | Options | Who Decides |
|---|---|---|
| Shared parent entity vs. peer entities | Seat model (A) vs. Independent peers (B) vs. Incremental duplication (C) | Eng leads, both pods |
| Where does subscription/billing live? | Per-Campaign, per-Office, or per-User | Product + Eng |
| PathToVictory for Serve? | Reuse P2V, create "ConstituencyProfile", or skip | Serve pod |
| Route structure for switcher | Prefixed routes vs. context state | Frontend leads |
| Migration approach | Big migration vs. incremental dual-write | Eng leads |
| Feature flag strategy | Per-phase flags vs. single "new-architecture" flag | Platform team |

---

## 5. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Data loss during migration | Low | Critical | Dual-write period, thorough backfill testing |
| Breaking existing Campaign flows | Medium | High | Feature flags, incremental rollout, e2e tests |
| Scope creep — "while we're at it" | High | Medium | Strict phase boundaries, resist refactoring unrelated code |
| Frontend/API version mismatch | Medium | Medium | API versioning or backward-compatible endpoints |
| Performance regression (multi-entity queries) | Low | Medium | Index planning, query review |
| Team coordination overhead | High | Medium | Clear ownership per phase, shared RFC review |

---

## 6. Open Questions

1. **Do elected officials need their own "subscription" tier?** Or does having an ElectedOffice record inherently grant Serve features? (Currently, `electedOffice` existence is used as an access gate alongside `isPro`.)

2. **Can a user run a campaign for a _different_ office than the one they currently hold?** e.g., a city council member running for state senate. This affects whether Campaign and ElectedOffice share position data or are fully independent.

3. **What happens to existing users with both a Campaign and ElectedOffice during migration?** Their ElectedOffice currently points to their Campaign. Do we clone data or restructure the relationship?

4. **How do CRM (HubSpot) contacts map to the new model?** Currently campaign-centric. Does each entity get its own CRM pipeline?

5. **Should the Ecanvasser/door knocking integration be shared or Campaign-only?** Elected officials may also do door-to-door constituent engagement.

---

## Appendix A: Files With Highest Campaign Coupling

These are the files that will require the most significant changes:

**API (Backend):**
- `src/campaigns/campaigns.controller.ts` — 15+ endpoints, main campaign CRUD
- `src/campaigns/services/campaigns.service.ts` — 39 methods, core business logic
- `src/campaigns/guards/UseCampaign.guard.ts` — Authorization boundary
- `src/voters/voterFile/voterFile.controller.ts` — Already has dual pro/electedOffice checks
- `src/pathToVictory/services/pathToVictory.service.ts` — Win number calculation
- `src/payments/services/paymentEventsService.ts` — Stripe integration
- `src/campaigns/services/crmCampaigns.service.ts` — HubSpot sync
- `src/queue/consumer/queueConsumer.service.ts` — All async job routing
- `src/contacts/contacts.service.ts` — Contact/voter data access

**Frontend:**
- `app/shared/hooks/CampaignProvider.tsx` — Global campaign state
- `app/shared/hooks/ElectedOfficeProvider.tsx` — Global office state
- `app/(candidate)/dashboard/shared/DashboardMenu.tsx` — Navigation
- `helpers/types.ts` — Campaign type definition (40+ fields)
- `gpApi/routes.ts` — All API route definitions

**Schema:**
- `prisma/schema/campaign.prisma` — Campaign model
- `prisma/schema/electedOffice.prisma` — ElectedOffice model
- `prisma/schema/campaign.jsonTypes.d.ts` — Campaign JSON field types (40+ fields in details)
- `prisma/schema/pathToVictory.prisma` — P2V model
