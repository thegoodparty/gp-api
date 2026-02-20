**Status:** In Review

# How To Read This Document

This document proposes a direction for how we separate Win and Serve at the data layer. It is an alternative to the [original proposal](./final.md) that replaces the in-product Organization model with pure Clerk Organizations.

Before you read, here's what would be most helpful from reviewers at this stage:

- **Does the Position table make sense as the single source of truth for BR+L2 data?** Is there a reason this normalization doesn't work?
- **Are we comfortable with the Clerk dependency?** This approach requires the Clerk migration to be completed (or at least the Organizations feature adopted) before shared features can ship.
- **Does the phased approach feel right?** Are we splitting the work in a way that minimizes risk and delivers value incrementally, or are there dependencies we're missing?
- **Are there impacts to your team's domain that this document doesn't account for?**

You don't need to have opinions on all of these — any one of them is valuable. And if your reaction is "this looks fine, I have no concerns," that's useful too.

**_Tip_**_: this document makes heavy use of_ **_subsections_** _-- it may be helpful to use the "collapse" arrows next to major headers to make visual parsing more friendly._

# Overview

Today, **Campaign** is the sole organizing entity across the GoodParty product — every feature, from voter data to AI content to websites, is scoped to a Campaign record. ElectedOffice (the Serve product) is coupled to Campaign via a required foreign key (FK), meaning an elected official can't exist without a campaign, and a user can't hold an office and run for a different position simultaneously.

This document proposes two structural changes to decouple Campaign and ElectedOffice:

1. A **Position** table that normalizes BallotReady position identity, geography, and L2 district data into a single reusable record — referenced by both Campaign and ElectedOffice.
2. **Clerk Organizations** as the sole organizational layer — providing the product switcher, request-scoped org context (via JWT), and the shared key that cross-product features (like Contacts) index against.

There is no in-product Organization table. Clerk Organizations handle the "which context is the user acting in?" question, while the Position table handles the "what political position does this context relate to?" question.

# Key Outcomes

We need the following key outcomes from this effort.

**Product Outcomes**

- Allow visually switching between "campaign" mode and "elected official" mode in the product. Each will have a separate filtered list of nav items (to be decided by product).
- Allow an elected official to transition _back_ into campaign mode, by creating a new campaign with a _separate_ district from their current elected office.
- A user should be able to go through the campaign → serve → campaign cycle _without_ needing to create a new user account (for their 2nd campaign).
- Users should see a _separate_ list of custom segments for their campaign and elected offices, when viewing the Contacts page.
- When in "elected official" mode, users should NOT be able to see Political Party information about constituents on the Contacts page.

**Technical Outcomes**

- Break the FK relationship between Campaign ↔ ElectedOffice.
- Conceptually support multiple Campaign records over time for a single user.
- Establish conventions for modeling data relationships for features that fall into each of these categories:
  - Features that are specific to Win
  - Features that are specific to Serve
  - Features that span both use cases

# Not In Scope

- Supporting onboarding new elected officials that did not get elected using Win
- Any changes to how Pro billing works (we only upsell Pro for Win, not Serve)
- Bulk modifications to `UseCampaign()`\-powered API routes
- The Clerk auth migration itself (owned by a separate team — this document assumes Clerk Organizations are available)

# Proposed Solution

There are a few primary technical problems need solving as part of this work:

## Key Problems

1. Today, Campaign+PathToVictory is the source of truth for a user's BallotReady ids and their L2 District. But, both candidates _and_ EOs need a BallotReady position and a matched L2 District. **Since we are separating ElectedOffice and Campaign, how will we store + model BR/L2 links for each use case?**
2. Some features (Contacts + future roadmap items) will need to support usage from Win _and_ Serve. **How will we handle keying for features that need cross-product support?**
3. With shared features serving both products, **how does the API know which context a request is targeting?**
4. Currently, the product does not _really_ support Win users having multiple Campaign objects over time. **What changes are needed to allow a single user to have multiple Campaigns over time?**

## Detailed Design

### The Position Table

Today, BallotReady position identity, geographic data, and L2 district links are duplicated across Campaign and PathToVictory (and would need further duplication on ElectedOffice). This document proposes normalizing that data into a dedicated **Position** table, keyed by the BallotReady `positionId`.

A Position represents a single political position (e.g., "Texas State Senate District 14") and its associated geographic and district data. Both Campaign and ElectedOffice reference a Position by FK.

```haskell
Position (PK: positionId from BallotReady)
  ├── office, ballotLevel, electionLevel
  ├── geography (state, city, county, zip, district)
  ├── L2 district match (districtId, type, name)

Campaign (many:1) ──→ Position
ElectedOffice (many:1) ──→ Position
```

Key design rules:

- A Position is **immutable reference data** — it describes a political office, not a user's relationship to it. Multiple Campaigns or ElectedOffices can reference the same Position.
- Campaign and ElectedOffice each hold a `positionId` FK.
- Position data is written/updated when a user selects an office (onboarding, office selection, district picker) and during bulk data refreshes from BallotReady.
- The `districtManuallySet` flag lives on Campaign/ElectedOffice (not Position), since it describes a user's override, not the position itself.

#### Schema (Prisma format)

```kotlin
model Position {
  positionId String @id @map("position_id")

  office      String?
  ballotLevel BallotReadyPositionLevel? @map("ballot_level")
  level       ElectionLevel?
  state       String?
  county      String?
  city        String?
  district    String?
  zip         String?

  l2DistrictId   String? @map("l2_district_id")
  l2DistrictType String? @map("l2_district_type")
  l2DistrictName String? @map("l2_district_name")

  campaigns      Campaign[]
  electedOffices ElectedOffice[]

  @@map("position")
}
```

Changes to Campaign and ElectedOffice:

```kotlin
model Campaign {
  // ... existing fields ...

  position   Position? @relation(fields: [positionId], references: [positionId])
  positionId String?   @map("position_id")

  clerkOrganizationId String? @map("clerk_organization_slug")

  // campaignId FK on ElectedOffice is REMOVED
}

model ElectedOffice {
  // ... existing fields ...

  position   Position? @relation(fields: [positionId], references: [positionId])
  positionId String?   @map("position_id")

  clerkOrganizationId String? @map("clerk_organization_slug")

  districtManuallySet Boolean @default(false) @map("district_manually_set")

  // campaignId FK is REMOVED
}
```

### Clerk Organizations as the Organizational Layer

Rather than introducing an in-product Organization table, this proposal uses **Clerk Organizations** directly as the organizational model. Each Campaign and each ElectedOffice is associated with a Clerk Organization (stored as `clerkOrganizationId` on the respective table).

```haskell
User
  └── Clerk Organization (external, managed by Clerk)
        ├── Campaign? (has clerkOrganizationId + positionId)
        └── ElectedOffice? (has clerkOrganizationId + positionId)
```

A Clerk Organization represents a user's organizational context — the thing they switch between in the product. Clerk manages membership, the active-org session state, and role-based access. We store the Clerk Organization's `id` on our records to link them, but there is no local Organization table and no FK constraint (since the source of truth is Clerk, not our DB).

#### How the product switcher works

The frontend uses Clerk's `<OrganizationSwitcher />` component (or a custom switcher built on `useOrganizationList()` + `setActive()`) to let users switch between their organizations. We store metadata on each Clerk Organization (via `publicMetadata`) to indicate its type and display info:

```json
{
  "type": "campaign",
  "positionId": "br_12345",
  "label": "State Senate District 14"
}
```

When the user switches orgs, Clerk's frontend SDK automatically refreshes the session token. The new JWT includes the active org's ID in the `o.id` claim.

#### How the API resolves org context

When Clerk is the auth layer, the active organization ID is embedded in the JWT session token. There is no need for a custom `X-Organization-Id` header.

The flow:

1. User switches org in the frontend (via Clerk switcher or `setActive()`)
2. Clerk SDK refreshes the session token automatically
3. Subsequent API requests carry the new token
4. Backend reads `o.id` from the JWT claims

On the backend, a `@UseOrganization()` guard reads the Clerk org ID from the verified JWT and attaches it to the request. Route handlers for shared features use this ID to query the relevant data:

```typescript
@UseOrganization()
async getVoterFileFilters(@Req() req) {
  const clerkOrgId = req.clerkOrganizationId
  return this.voterFileFilterService.findMany({
    where: { clerkOrganizationId: clerkOrgId }
  })
}
```

#### How shared features key against the org

Features that span both Win and Serve (like VoterFileFilter) store a `clerkOrganizationId` string column — **not** a foreign key to a local table. This is an indexed string that matches the Clerk org ID from the JWT.

```kotlin
model VoterFileFilter {
  id String @id @default(uuid())

  clerkOrganizationId String @map("clerk_organization_slug")

  // ... existing filter fields ...

  @@index([clerkOrganizationId])
  @@map("voter_file_filter")
}
```

This means:

- **No FK constraint** — the DB does not enforce referential integrity against Clerk. The Clerk org ID is treated as an opaque external identifier.
- **Querying is straightforward** — `WHERE clerkOrganizationId = ?` with an index.
- **No join required** — shared features don't need to join through an intermediary table to resolve ownership.

### Summary of What's Changing vs. Not

**What's changing:**

- **New table:** Position — normalized BR+L2+geography data, keyed by BallotReady positionId
- **Campaign:** gains `positionId` FK and `clerkOrganizationId` column, loses `electedOffices` relation
- **ElectedOffice:** gains `positionId` FK and `clerkOrganizationId` column, `campaignId` is removed
- **VoterFileFilter:** gains `clerkOrganizationId` column (replacing campaign FK for org-scoped access)
- **Product switcher:** powered by Clerk's org switching, not a custom `GET /organizations` endpoint
- **Org context on API requests:** read from JWT claims, not a custom header

**What's NOT changing:**

- All existing Campaign-only relations (website, outreach, AI, P2V, etc.) — still FK to Campaign
- All existing ElectedOffice-only relations (polls, poll messages) — still FK to ElectedOffice
- PathToVictory — still FKs to Campaign
- `@UseCampaign()` — stays for Win-only endpoints
- `@UseElectedOffice()` — stays for Serve-only endpoints

## Implementation Path (summarized)

This proposed path assumes Clerk Organizations are available (i.e., the Clerk auth migration has progressed far enough to support org creation and switching). The Position table work can begin independently.

### Phase 1: Position table and initial backfill

- Create the Position table.
- Add `positionId` FK to Campaign and ElectedOffice (initially nullable).
- Update key write paths (office selection, district pickers, "I won" flow) to double-write BR+L2 data onto both the existing locations and the Position table.
- Backfill Position records from existing Campaign+P2V data, populate `positionId` on Campaign and ElectedOffice.
- _Independently_: begin creating Clerk Organizations for existing users and storing `clerkOrganizationId` on Campaign and ElectedOffice. This can happen as soon as the Clerk migration team enables Organizations.

**Value Delivered**: Position table is established as the normalized source of truth for BR+L2 data. Backfill is complete. The path to Clerk org linking is started.

### Phase 2: Product switcher, shared features, and read-path migration

- Implement the product switcher UI using Clerk's `<OrganizationSwitcher />` or custom UI built on Clerk hooks.
- Implement the `@UseOrganization()` guard that reads `o.id` from the JWT.
- Migrate all code paths that read BR+L2 data from Campaign/PathToVictory to read from Position instead.
- Move VoterFileFilter to use `clerkOrganizationId` and update Contacts access-checking rules.
- Update Profile and Admin UI to allow modifying offices and districts across multiple Campaigns/ElectedOffices for a single user.

**Value Delivered**: Contact filters are segmented by Clerk org. The system reads BR+L2 from Position. Users can switch between "win" and "serve" mode via the Clerk-powered switcher.

### Phase 3: Cleanup + "New Campaign"

- Remove dual-write paths from Phase 1.
- Drop deprecated columns (campaignId on ElectedOffice, BR+L2 fields on Campaign/P2V).
- Clean up legacy access checks.
- Add a flow for Serve users to create a new Campaign (which creates a new Clerk Organization + Campaign record).

**Value Delivered**: Campaign and ElectedOffice are fully decoupled. Position is the sole source of truth for position/district data. Serve users can move seamlessly back into Campaign mode.

## Key Takeaways

- **Position is pure reference data.** It normalizes BR+L2+geography into one place, keyed by BallotReady positionId. Multiple Campaigns or ElectedOffices can share the same Position.
- **No in-product Organization table.** Clerk Organizations provide the organizational layer — product switching, session context, and the shared key for cross-product features.
- **Shared features use Clerk org ID as an indexed string, not a FK.** This keeps the schema simple and avoids coupling our relational model to an external service's primary keys.
- **Existing routes and guards don't change.** `@UseCampaign()` and `@UseElectedOffice()` stay as-is. Only shared features get a new `@UseOrganization()` guard that reads from the JWT.
- **The implementation is phased for safety.** Position table work can begin immediately. Clerk-dependent work begins when the Clerk migration team enables Organizations.

# Open Questions

- What is the right place for the updated admin UI to modify office + district data — gp-admin, or the existing Admin UI?

- What does this mean for sync of data to HubSpot?

- What metadata do we need to store on Clerk Organizations (via `publicMetadata` / `privateMetadata`) for the product switcher to render correctly?

- How do we handle the timing dependency with the Clerk migration team? Can Phase 1 (Position table) proceed independently while we wait for Clerk Organizations to become available?

# Alternatives Considered

### In-product Organization model (original proposal)

Introduce a first-party Organization table in our database that holds position/geography/district data, type enum, and FK relationships to Campaign, ElectedOffice, and shared features. Use a custom `X-Organization-Id` header for API request scoping.

**Why not:**

- Creates a parallel organizational model that we'd later need to reconcile with Clerk Organizations when the Clerk migration completes.
- The `X-Organization-Id` header and ownership-verification guard are custom plumbing that Clerk's JWT-based org context replaces for free.
- The Position table normalization is cleaner — position/geography/district data describes a political office, not a user's organizational context. Separating these concerns is a better fit.

### No shared model, just keep using ElectedOffice and Campaign

Campaign and ElectedOffice each get their own position/district fields. No shared Organization model. Shared features accept `campaignId | electedOfficeId` polymorphically.

**Why not:**

- Designing foreign keys for shared features becomes a small pain and a source of boilerplate. You need to support a campaignId _or_ an electedOfficeId foreign key on any related tables. Complexity grows with each new shared feature.
- We duplicate management of BR+L2 data.
- There's no natural entity for the product switcher or future RBAC.
