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

The Serve team has already built a parallel pattern:

- **`@UseElectedOffice()` decorator + guard** — Used by polls and contact engagement controllers
- **`@ReqElectedOffice()`** — Parameter decorator extracting elected office from request

### 2.3 What's Actually Shared Between Win and Serve Today

The shared surface area between the two products is **small**. An audit of every file referencing ElectedOffice shows:

**Truly shared (code explicitly branches on both):**

| Feature                   | Where                                          | Pattern                                                      |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------ |
| District/position data    | Campaign.details JSON, PathToVictory.data JSON | Both products need office, BallotReady position, L2 district |
| Voter file filter CRUD    | `voterFile.controller.ts:137,172`              | `isPro \|\| hasElectedOffice` access gate                    |
| Contacts search           | `contacts.service.ts:95-101`                   | `isPro \|\| hasElectedOffice` access gate                    |
| Contacts download         | `contacts.service.ts:230-234`                  | `isPro \|\| hasElectedOffice` access gate                    |
| Contacts table (frontend) | `ContactsTableProvider.tsx:163`                | `canUseProFeatures = isPro \|\| !!electedOffice`             |

**Already Serve-only (use `@UseElectedOffice()`, not `@UseCampaign()`):**

- Polls — `polls.controller.ts`
- Contact engagement — `contactEngagement.controller.ts`

**Win-only (no ElectedOffice awareness at all):**

- AI content, AI chat, website, outreach, ecanvasser, P2V, campaign tasks, TCR compliance, campaign positions/top issues, campaign plan versions

### 2.4 Frontend Architecture

- **`CampaignProvider` / `useCampaign()`** — Global React context providing the single campaign. Fetches from `GET /campaigns/mine`.
- **`ElectedOfficeProvider` / `useElectedOffice()`** — Separate context, fetches via `GET /elected-office/current`.
- **`DashboardMenu`** — Conditionally shows Serve features (Polls, Contacts) when `electedOffice` exists, but still operates within the campaign context.
- **`serveAccess()`** — Server-side redirect guard: if no elected office, redirect to `/dashboard`.
- **Feature flag `serve-access`** — Controls Serve feature visibility in the nav.
- **`campaign.isPro`** — Referenced in 20+ frontend files for feature gating.

### 2.5 Integration Points Summary

| System                           | Campaign References                         | Impact of This Change                    |
| -------------------------------- | ------------------------------------------- | ---------------------------------------- |
| API Controllers                  | 16 controllers use `@UseCampaign()`         | Low — most stay as-is                    |
| API Services                     | 80+ files import Campaign                   | Low — most stay as-is                    |
| Database (FK)                    | 15+ tables have `campaignId`                | Low — only VoterFileFilter moves to Seat |
| Shared features (voter/contacts) | 4 files with `isPro \|\| hasElectedOffice`  | Medium — these move to Seat-based access |
| Queue/Jobs                       | All async jobs routed by `campaignId`       | Low — unchanged                          |
| Payments (Stripe)                | `campaignId` in checkout metadata           | Low — isPro stays on Campaign            |
| Frontend Contexts                | `CampaignProvider`, `ElectedOfficeProvider` | Medium — add SeatProvider                |

---

## 3. Recommendation: Introduce "Seat" as Shared Position Context

### 3.1 The Approach

Introduce a **Seat** model that represents a user's relationship to a political position. Seat is **not** a universal parent entity that replaces Campaign — it is specifically the **shared position context** between Win and Serve.

The key principle: **only shared features FK to Seat.** Product-specific features keep their existing FKs.

- **Win-only features** → `campaignId` (P2V, website, AI content, ecanvasser, TCR, outreach, etc.)
- **Serve-only features** → `electedOfficeId` (polls, contact engagement)
- **Shared features** → `seatId` (voter file filters, contacts access)

A Seat can have a Campaign, an ElectedOffice, or both (e.g., holding office while running for re-election). A User can have multiple Seats (e.g., serving on city council while running for state senate).

```
User (1)
  └── seats (1:many)
        └── Seat
              ├── position/geography/district data
              ├── campaign? (optional 1:1) — Win product
              ├── electedOffice? (optional 1:1) — Serve product
              └── voterFileFilters (1:many) — shared feature
```

### 3.2 Why Seat (and why not the alternatives)

We considered three options:

**Option A: Seat as universal parent** — Every feature FKs to Seat, Campaign and ElectedOffice are just extensions. Cleanest architecture, but requires touching 80+ services and 16 controllers. Too costly and risky for a startup.

**Option B: Fully independent peers** — Campaign and ElectedOffice each have their own position/district data, no shared entity. Gets ElectedOffice unblocked fast, but shared features need polymorphic `campaignId | electedOfficeId` patterns that get messy. Multi-user RBAC would require two parallel membership systems. No natural entity for the product switcher.

**Option C: Incremental duplication** — Keep ElectedOffice coupled to Campaign, keep adding `|| hasElectedOffice` branches. Fastest but doesn't solve the core problem: ElectedOffice can't exist without a Campaign.

**Our recommendation: Seat as minimal shared context.** This gets the key benefits of Option A (shared position data, clean FK for shared features, natural switcher entity, future RBAC anchor) without the migration cost (most FKs stay on Campaign/ElectedOffice). The blast radius is small because the shared surface area is small.

### 3.3 Design Decisions Made

| Decision                                         | Resolution                  | Rationale                                                                                                      |
| ------------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Where does `isPro` live?                         | Stays on Campaign           | Serve features are gated by ElectedOffice existence, not subscription. No Serve billing for now.               |
| Where does PathToVictory live?                   | Stays on Campaign           | Win numbers are candidate-specific. Seat holds district data; P2V holds the historical calculation.            |
| Extract fields from campaign.details JSON?       | No (beyond what Seat needs) | Don't increase migration scope. Campaign.details stays as-is. Seat gets its own position/district columns.     |
| Can a Seat have both Campaign and ElectedOffice? | Yes                         | Running for re-election while holding office. Product-specific features use their own FKs, so no ambiguity.    |
| Historical campaigns/offices?                    | New Seat per engagement     | Today we mutate the single Campaign. Going forward, old Seats stay in DB. Active status derived from children. |

### 3.4 Proposed Schema

```prisma
model Seat {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId Int  @map("user_id")

  // Position identity
  positionId  String?                    @map("position_id")
  raceId      String?                    @map("race_id")
  office      String?
  ballotLevel BallotReadyPositionLevel?  @map("ballot_level")
  level       ElectionLevel?
  state       String?
  county      String?
  city        String?
  district    String?
  zip         String?

  // L2 district match — drives voter file + contacts access
  l2DistrictId        String?  @map("l2_district_id")
  l2DistrictType      String?  @map("l2_district_type")
  l2DistrictName      String?  @map("l2_district_name")
  districtManuallySet Boolean  @default(false) @map("district_manually_set")

  // Children
  campaign      Campaign?
  electedOffice ElectedOffice?

  // Shared features
  voterFileFilters VoterFileFilter[]

  @@index([userId])
  @@map("seat")
}

model Campaign {
  // ... all existing fields unchanged ...

  // NEW: FK to Seat
  seat   Seat @relation(fields: [seatId], references: [id], onDelete: Cascade)
  seatId Int  @unique @map("seat_id")

  // Kept for now: user FK (backward compat during migration)
  user   User? @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId Int   @map("user_id")

  // Win-only relations — all unchanged
  pathToVictory         PathToVictory?
  campaignUpdateHistory CampaignUpdateHistory[]
  topIssues             TopIssue[]
  campaignPositions     CampaignPosition[]
  campaignPlanVersion   CampaignPlanVersion?
  aiChats               AiChat[]
  ecanvasser            Ecanvasser?
  ScheduledMessage      ScheduledMessage[]
  tcrCompliance         TcrCompliance?
  website               Website?
  outreach              Outreach[]
  communityIssue        CommunityIssue[]

  // REMOVED: electedOffices relation (moved to Seat)

  @@index([slug])
  @@index([seatId])
  @@map("campaign")
}

model ElectedOffice {
  // ... all existing fields unchanged ...

  // NEW: FK to Seat (replaces campaignId)
  seat   Seat @relation(fields: [seatId], references: [id], onDelete: Cascade)
  seatId Int  @unique @map("seat_id")

  // DEPRECATED: kept nullable during migration, remove later
  campaignId Int? @map("campaign_id")

  // Serve-only relations — unchanged
  polls                  Poll[]
  pollIndividualMessages PollIndividualMessage[]

  @@index([userId])
  @@index([seatId])
  @@map("elected_office")
}

model VoterFileFilter {
  // ... all existing filter columns unchanged ...

  // NEW: FK to Seat (replaces campaignId)
  seat   Seat @relation(fields: [seatId], references: [id], onDelete: Cascade)
  seatId Int  @map("seat_id")

  // DEPRECATED: kept nullable during migration, remove later
  campaignId Int? @map("campaign_id")

  @@index([seatId])
  @@index([id, seatId])
  @@map("voter_file_filter")
}
```

**What's changing:**

- **New model:** Seat — position/geography/district fields
- **Campaign:** gains `seatId` FK, loses `electedOffices` relation
- **ElectedOffice:** gains `seatId` FK, `campaignId` becomes nullable (deprecated)
- **VoterFileFilter:** gains `seatId` FK, `campaignId` becomes nullable (deprecated)

**What's NOT changing:**

- `campaign.details` JSON — untouched
- All Campaign-only relations (website, outreach, AI, P2V, etc.) — still FK to Campaign
- All ElectedOffice-only relations (polls, poll messages) — still FK to ElectedOffice
- PathToVictory — still FKs to Campaign
- `isPro` — stays on Campaign
- `@UseCampaign()` — stays for Win-only endpoints
- `@UseElectedOffice()` — stays for Serve-only endpoints

---

## 4. Migration Plan

### Phase 1: Schema + Data Foundation

- Create Seat table with position/geography/district columns
- Add `seatId` FK to Campaign, ElectedOffice, and VoterFileFilter (alongside existing FKs)
- Backfill: create one Seat per existing Campaign, populate position/district data from `campaign.details` JSON and `pathToVictory.data` JSON
- Backfill: point existing ElectedOffice records at the correct Seat
- Backfill: point existing VoterFileFilter records at the correct Seat

### Phase 2: Shared Features Move to Seat

- Voter file filter CRUD uses `seatId` instead of `campaignId`
- Contacts search/download access check uses Seat (replaces `isPro || hasElectedOffice` with Seat-based lookup)
- Create `@UseSeat()` guard for shared feature endpoints
- Frontend: add `SeatProvider` / `useSeat()` for shared context

### Phase 3: ElectedOffice Independence

- ElectedOffice creation no longer requires a Campaign — only a Seat
- `campaignId` on ElectedOffice goes unused for new records
- Serve endpoints fully decoupled from Campaign
- Frontend: product switcher (select a Seat, then Win or Serve mode)

### Phase 4: Cleanup

- Remove nullable `campaignId` from ElectedOffice
- Remove nullable `campaignId` from VoterFileFilter
- Remove `electedOffices` relation from Campaign model
- Remove dual-read code

### Future: Onboarding Elected Officials outside of Win

Now that ElectedOffice has been fully separated from Campaign, we have a clean path to support onboarding fully new Elected Officials in the future. But, we've avoided needing to invest too early in their onboarding experience.

### Future: Multi-User RBAC

When team member access is needed, Seat is the natural anchor:

```prisma
model SeatMember {
  id     Int      @id @default(autoincrement())
  seatId Int
  seat   Seat     @relation(fields: [seatId], references: [id], onDelete: Cascade)
  userId Int
  user   User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  role   SeatRole @default(member)

  @@unique([seatId, userId])
}

enum SeatRole {
  owner
  admin
  manager
  member
}
```

One membership record per user per Seat. A team member managing both the campaign and the elected office gets one record — access to both children comes through the Seat.

---

## 5. Risk Assessment

| Risk                                               | Likelihood | Impact   | Mitigation                                                                                    |
| -------------------------------------------------- | ---------- | -------- | --------------------------------------------------------------------------------------------- |
| Data loss during Seat backfill                     | Low        | Critical | Backfill script tested in staging; Seat data is copied, not moved                             |
| Breaking voter file / contacts flows               | Medium     | High     | Dual-FK period (both seatId and campaignId); feature flags                                    |
| Position data on Seat drifts from campaign.details | Medium     | Low      | Seat is source of truth going forward; campaign.details becomes read-only for position fields |
| Scope creep — "while we're at it" refactoring      | High       | Medium   | Strict rule: don't extract non-position fields from campaign.details JSON                     |
| Team coordination overhead                         | Medium     | Medium   | Serve team drives migration; Win team reviews; clear phase boundaries                         |

---

## 6. Open Questions

1. **What happens to existing users with both a Campaign and ElectedOffice during migration?** Their ElectedOffice currently points to their Campaign. During backfill, both get pointed at the same Seat. This preserves the current behavior while enabling future independence.

2. **How does the product switcher work with Seats?** User sees a list of their Seats. Each Seat shows its office name and which products are active (Campaign, ElectedOffice, or both). Selecting a Seat sets the context; within that context, the UI shows Win features, Serve features, or both.

3. **Should district data updates write to Seat or PathToVictory?** Going forward, district matching (L2 district type/name/ID) writes to Seat. PathToVictory keeps its copy as part of the historical win-number calculation. Seat is the live source of truth for "what district is this."

4. **How do CRM (HubSpot) contacts map to the new model?** Currently campaign-centric. Short-term: unchanged. Long-term: may need a Seat-level CRM association.

5. **Should Outreach move to Seat?** Currently Win-only. If elected officials need outreach, it could move to Seat. Not needed now — revisit when Serve outreach is prioritized.

---

## Appendix A: Files Requiring Changes

**Phase 1-2 (direct changes needed):**

| File                                                  | Change                                            |
| ----------------------------------------------------- | ------------------------------------------------- |
| `prisma/schema/` (new file)                           | Seat model definition                             |
| `prisma/schema/campaign.prisma`                       | Add `seatId` FK, remove `electedOffices` relation |
| `prisma/schema/electedOffice.prisma`                  | Add `seatId` FK, make `campaignId` nullable       |
| `prisma/schema/voterFileFilter.prisma`                | Add `seatId` FK, make `campaignId` nullable       |
| `src/voters/voterFile/voterFile.controller.ts`        | Voter file filter CRUD uses Seat                  |
| `src/contacts/services/contacts.service.ts`           | Contacts search/download uses Seat                |
| `src/electedOffice/services/electedOffice.service.ts` | Create ElectedOffice with Seat                    |
| Frontend: `ContactsTableProvider.tsx`                 | `canUseProFeatures` check uses Seat               |

**Unchanged (vast majority of codebase):**

- All 16 controllers using `@UseCampaign()` — unchanged
- All Campaign-only services (AI, website, outreach, P2V, etc.) — unchanged
- All ElectedOffice-only controllers (polls, contact engagement) — unchanged
- `campaign.details` JSON — unchanged
- Payment/Stripe integration — unchanged
- Queue consumer — unchanged
