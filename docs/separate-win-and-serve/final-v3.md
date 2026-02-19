**Status:** In Review

# How To Read This Document

This document proposes a direction for how we separate Win and Serve at the data layer. It synthesizes feedback from two prior iterations ([V1](./final.md), [V2](./final-pure-clerk.md)) into an approach that unblocks the implementing team now while establishing a clear migration path to Clerk Organizations.

Before you read, here's what would be most helpful from reviewers at this stage:

- **Does the BallotPosition + thin Organization split feel right?** Position data is normalized into its own table; Organization is just a lightweight linking entity with a type.
- **Are we comfortable with the "no FK" convention for Organization references?** All references to `organizationId` are indexed strings, not foreign keys — this is intentional to make the Clerk migration trivial.
- **Does the Clerk migration path make sense?** Phase 4 describes the switchover. Is there anything missing?
- **Are there impacts to your team's domain that this document doesn't account for?**

You don't need to have opinions on all of these — any one of them is valuable. And if your reaction is "this looks fine, I have no concerns," that's useful too.

**_Tip_**_: this document makes heavy use of_ **_subsections_** _-- it may be helpful to use the "collapse" arrows next to major headers to make visual parsing more friendly._

# Overview

Today, **Campaign** is the sole organizing entity across the GoodParty product — every feature, from voter data to AI content to websites, is scoped to a Campaign record. ElectedOffice (the Serve product) is coupled to Campaign via a required foreign key (FK), meaning an elected official can't exist without a campaign, and a user can't hold an office and run for a different position simultaneously.

This document proposes three structural changes to decouple Campaign and ElectedOffice:

1. A **BallotPosition** table that normalizes BallotReady position identity, geography, and L2 district data into a single reusable record — referenced by both Campaign and ElectedOffice.
2. A **temporary Organization table** — a thin linking entity that holds a type (`campaign` | `electedOffice`) and links to its child record. It does _not_ hold position data. It serves as the shared key for cross-product features and powers the product switcher until Clerk Organizations are adopted.
3. A **defined migration path to Clerk Organizations** — Organization references throughout the system are stored as plain strings (no foreign keys). When we backfill Clerk Organizations, we set each Clerk org's `slug` to the in-product Organization UUID. Clerk's JWT includes the slug in its claims (`o.slg`), so the backend guard simply reads the slug — which _is_ the UUID — and everything works without changing a single stored value. The Organization table can then be dropped.

The long-term destination is the pure Clerk state. The in-product Organization table is scaffolding that unblocks the implementing team without waiting on the Clerk migration.

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
- Establish a clear, low-cost migration path from the in-product Organization to Clerk Organizations.

# Not In Scope

- Supporting onboarding new elected officials that did not get elected using Win
- Any changes to how Pro billing works (we only upsell Pro for Win, not Serve)
- Bulk modifications to `UseCampaign()`\-powered API routes
- Multi-user RBAC
- The Clerk auth migration itself (owned by a separate team)

# Proposed Solution

There are a few primary technical problems need solving as part of this work:

## Key Problems

1. Today, Campaign+PathToVictory is the source of truth for a user's BallotReady ids and their L2 District. But, both candidates _and_ EOs need a BallotReady position and a matched L2 District. **Since we are separating ElectedOffice and Campaign, how will we store + model BR/L2 links for each use case?**
2. Some features (Contacts + future roadmap items) will need to support usage from Win _and_ Serve. **How will we handle keying for features that need cross-product support?**
3. With shared features serving both products, **how does the API know which context a request is targeting?**
4. Currently, the product does not _really_ support Win users having multiple Campaign objects over time. **What changes are needed to allow a single user to have multiple Campaigns over time?**

## Detailed Design

### The BallotPosition Table

Today, BallotReady position identity, geographic data, and L2 district links are duplicated across Campaign and PathToVictory (and would need further duplication on ElectedOffice). This document proposes normalizing that data into a dedicated **BallotPosition** table, keyed by the BallotReady `positionId`.

> **Naming note:** The codebase already has a `Position` model (for campaign issue stances, linked to TopIssue). The new table uses the name `BallotPosition` to avoid collision.

A BallotPosition represents a single political position (e.g., "Texas State Senate District 14") and its associated geographic and district data. Both Campaign and ElectedOffice reference a BallotPosition by FK.

```haskell
BallotPosition (PK: positionId from BallotReady)
  ├── office, ballotLevel, electionLevel
  ├── geography (state, city, county, zip, district)
  ├── L2 district match (districtId, type, name)

Campaign (many:1) ──→ BallotPosition
ElectedOffice (many:1) ──→ BallotPosition
```

Key design rules:

- A BallotPosition is **immutable reference data** — it describes a political office, not a user's relationship to it. Multiple Campaigns or ElectedOffices can reference the same BallotPosition.
- Campaign and ElectedOffice each hold a `positionId` FK (this _is_ a real foreign key — BallotPosition is a permanent table).
- BallotPosition data is written/updated when a user selects an office (onboarding, office selection, district picker) and during bulk data refreshes from BallotReady.
- The `districtManuallySet` flag lives on Campaign/ElectedOffice (not BallotPosition), since it describes a user's override, not the position itself.

#### Schema (Prisma format)

```kotlin
model BallotPosition {
  positionId String @id @map("position_id")

  name        String
  ballotLevel BallotReadyPositionLevel @map("ballot_level")
  level       ElectionLevel
  state       String?
  county      String?
  city        String?
  district    String?
  zip         String?

  l2DistrictId   String @map("l2_district_id")
  l2DistrictType String @map("l2_district_type")
  l2DistrictName String @map("l2_district_name")

  campaigns      Campaign[]
  electedOffices ElectedOffice[]

  @@map("ballot_position")
}
```

### The Organization Table (temporary)

This document proposes a thin **Organization** table that serves as the shared context between Win and Serve. Unlike the V1 proposal, Organization holds _no_ position or geography data — it is purely a linking entity with a type.

**This table is a temporary scaffolding solution to unblock the team while the Clerk auth migration is completed. It will be replaced by Clerk Organizations once the auth migration is complete, and dropped entirely.**

```haskell
User (1:many)
  └── Organization
        ├── type: campaign | electedOffice
        │
        ├── campaign? (linked via Campaign.organizationId string)
        └── electedOffice? (linked via ElectedOffice.organizationId string)
```

Organizations follow these **key design rules**:

- An Organization has _exactly one "child"_: either a Campaign or an ElectedOffice, never both.
- **No foreign keys point to Organization.** Campaign, ElectedOffice, and shared features (like VoterFileFilter) store `organizationId` as an **indexed string column**, not a Prisma relation. This is intentional — the Organization table is temporary scaffolding that will be replaced by Clerk Organizations. Using plain strings means the migration requires zero data changes: we set the Clerk org slug to the UUID, and the existing stored values just work.
- A User can have multiple Organizations (e.g., a `campaign` Organization for a state senate run and an `electedOffice` Organization for a current city council position).
- Feature-specific data keys like so:
  - Win-only features FK to Campaign (unchanged)
  - Serve-only features FK to ElectedOffice (unchanged)
  - Shared features store `organizationId` as an indexed string

#### Schema (Prisma format)

```kotlin
enum OrganizationType {
  CAMPAIGN
  ELECTED_OFFICE
}

model Organization {
  id      String   @id @default(uuid())

  owner   User @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  ownerId Int  @map("owner_id")

  type OrganizationType

  @@index([ownerId])
  @@map("organization")
}
```

Changes to Campaign and ElectedOffice:

```kotlin
model Campaign {
  // ... existing fields ...

  position   BallotPosition? @relation(fields: [positionId], references: [positionId])
  positionId String?         @map("position_id")

  organizationId String? @map("organization_id")

  @@index([organizationId])
}

model ElectedOffice {
  // ... existing fields ...

  position   BallotPosition? @relation(fields: [positionId], references: [positionId])
  positionId String?         @map("position_id")

  organizationId String? @map("organization_id")

  districtManuallySet Boolean @default(false) @map("district_manually_set")

  @@index([organizationId])
}
```

Changes to VoterFileFilter:

```kotlin
model VoterFileFilter {
  // ... existing fields ...

  organizationId String @map("organization_id")

  @@index([organizationId])
  @@index([id, organizationId])
}
```

Note: `organizationId` on all three models is a **plain String column with an index** — not a Prisma `@relation`. There is no `onDelete: Cascade`, no referential integrity enforced by the database. This is by design.

### The `X-Organization-Id` Header and `@UseOrganization()`

With multiple organizations per user, and some features (like Contacts) supporting usage from both Win + Serve, we need _some way to resolve which Organization a particular API request is targeting_. This document proposes an `X-Organization-Id` header as the interim mechanism (to be replaced by Clerk's JWT-based org context later).

#### How the header works

The frontend stores the user's active Organization selection from their switcher. Our centralized API utilities attach `X-Organization-Id: <id>` to every request automatically. On the server, a `@UseOrganization()` guard reads the header, verifies the Organization belongs to the authenticated user, and attaches the `organizationId` to the request.

#### Why a header?

There are two primary alternatives to using a header:

_Use a path parameter_ (e.g. `GET /orgs/:orgId/voter-filters`) -- why not this:

- Duplication and boilerplate required in any route that needs to serve both features.
- We must modify existing route patterns that are in production use (e.g. in Contacts)

_Use a query parameter_ (e.g. use `/voter-file/filters?organizationId=123`) -- why not this:

- Duplication and boilerplate required in any route that needs to serve both features.
- We must modify existing route patterns that are in production use (e.g. in Contacts)

Using a header provides a few wins:

- No changes to existing URLs required
- Trivially easy to universally attach to (and read on) all requests -- we don't have to "remember" to match the convention everywhere
- Easy to swap out later — when Clerk arrives, the guard reads from the JWT instead of the header, and the frontend stops attaching the header. The decorator interface and everything downstream stays identical.

### Migration to Clerk Organizations

The in-product Organization table is designed to be replaced by Clerk Organizations. The migration is intentionally zero-cost at the data layer because of two design decisions made upfront:

1. **No foreign keys to Organization.** Every `organizationId` column in the system is a plain indexed string containing a UUID.
2. **Clerk Organizations support slugs, and UUIDs are valid slugs.** When we create Clerk Organizations, we set each one's `slug` to the corresponding in-product Organization UUID. Clerk's JWT v2 includes the active org's slug in its claims (`o.slg`). The backend guard reads `o.slg` — which _is_ the UUID — and the existing stored `organizationId` values match without any data migration.
3. **The `@UseOrganization()` guard abstracts the source.** Route handlers read `request.organizationId` — they don't know or care whether it came from a header or a JWT. Only the guard internals change.

#### How the migration works

1. **Backfill Clerk Organizations.** For each in-product Organization, create a Clerk Organization via the `@clerk/backend` SDK. Set the Clerk Organization's `slug` to the in-product Organization's UUID. Set `publicMetadata` with `{ type, positionId }`. Set `createdBy` to the corresponding Clerk user ID.

2. **Swap the guard.** Update `@UseOrganization()` to read `o.slg` from the Clerk JWT instead of reading the `X-Organization-Id` header. Since the slug _is_ the UUID, `request.organizationId` produces the exact same value. All downstream route handlers are unaffected. No stored data changes.

3. **Swap the product switcher.** Replace the custom switcher (powered by `GET /organizations` and local state) with Clerk's `<OrganizationSwitcher />` or a custom switcher built on `useOrganizationList()` + `setActive()`. Remove the `X-Organization-Id` header attachment from the frontend API client.

4. **Drop the Organization table.** Remove the model, the `GET /organizations` endpoint, and the Organization service.

**No data migration is needed.** The `organizationId` values stored in Campaign, ElectedOffice, VoterFileFilter, and any future shared-feature tables remain unchanged. The Clerk org slug _is_ the UUID.

#### Why slugs?

Clerk does not allow specifying a custom `id` when creating an Organization — Clerk generates `org_xxx` IDs internally. However, Clerk Organizations support a `slug` field (lowercase alphanumeric + dashes). UUIDs like `550e8400-e29b-41d4-a716-446655440000` are valid slugs. Clerk's JWT v2 format includes the slug in its claims as `o.slg`, meaning the backend can read it directly from the token without any API call. By setting slug = in-product Organization UUID, the existing `organizationId` values throughout the system continue to work as-is — the slug is the bridge that makes the migration a pure code change with zero data changes.

## Implementation Path (summarized)

There are several key milestones in the proposed implementation path. Phases 1–3 have **no dependency on the Clerk migration** and can begin immediately. Phase 4 is the Clerk switchover.

A more detailed implementation path is contained in the [subdoc](./final-v3-implementation-plan.md).

### Phase 1: BallotPosition table, Organization table, and backfill

- Create the BallotPosition table and the Organization table.
- Add `positionId` and `organizationId` string columns to Campaign and ElectedOffice.
- Update key write paths to double-write BR+L2 data and create Organizations alongside Campaigns/ElectedOffices.
- Backfill BallotPosition and Organization records for all existing data. Make columns non-nullable.

**Value Delivered**: BallotPosition is established as the source of truth for BR+L2 data. Every Campaign and ElectedOffice has an Organization. No Clerk dependency.

### Phase 2: Migrate Contacts and Read Paths

- Implement the product switcher UI, powered by `GET /organizations` and the `X-Organization-Id` header.
- Create `@UseOrganization()` guard and `@ReqOrganization()` decorator.
- Migrate BR+L2 read paths from Campaign/P2V to BallotPosition.
- Move VoterFileFilter onto Organization and update Contacts access-checking rules.

**Value Delivered**: Contact filters are segmented by Organization. BallotPosition is the single source of truth for BR+L2 data. Users can switch between Win and Serve in the UI.

### Phase 3: Cleanup + "New Campaign"

- Remove dual-write paths. Drop deprecated BR+L2 columns from Campaign/P2V.
- Drop `ElectedOffice.campaignId` and the `electedOffices` relation on Campaign.
- Add "new campaign" flow for Serve users.

**Value Delivered**: Campaign and ElectedOffice are fully decoupled. Serve users can move back into Campaign mode.

### Phase 4: Migrate to Clerk Organizations

- Backfill Clerk Organizations with slug = in-product Organization UUID.
- Swap the guard to read `o.slg` from the Clerk JWT (the slug _is_ the UUID — no data migration needed).
- Swap the product switcher to Clerk hooks. Remove the `X-Organization-Id` header.
- Drop the Organization table.

**Value Delivered**: The system is in the pure Clerk state. No in-product Organization table, no custom header. Clerk handles org context, switching, and (eventually) RBAC. Zero data migration — all existing `organizationId` values remain unchanged.

## Key Takeaways

- **BallotPosition is pure reference data.** It normalizes BR+L2+geography into one place, keyed by BallotReady positionId. It is a permanent table.
- **Organization is thin and temporary.** It holds a type and an owner — no position data. It exists to unblock the team now and will be replaced by Clerk Organizations.
- **No foreign keys point to Organization.** All `organizationId` references are plain indexed strings. Combined with the slug trick, this means the Clerk migration requires zero data changes — just a code swap in the guard and frontend.
- **Existing routes and guards don't change.** `@UseCampaign()` and `@UseElectedOffice()` stay as-is. Only shared features get a new `@UseOrganization()` guard.
- **The Clerk migration is Phase 4, not a future unknown.** The design document explicitly accounts for the switchover and sizes the work.

# Open Questions

- What is the right place for the updated admin UI to modify office + district data — gp-admin, or the existing Admin UI?

- What does this mean for sync of data to HubSpot?

- What Clerk Organization `publicMetadata` schema do we need for the product switcher to render correctly after the migration?

# Alternatives Considered

### V1: In-product Organization with position data

The original proposal placed BR+L2+geography data directly on the Organization model and used real FKs from Campaign/ElectedOffice/VoterFileFilter to Organization.

**Why not:**

- Mixing position reference data with organizational context conflates two concerns. The BallotPosition table is a cleaner separation.
- Real FKs to Organization make the Clerk migration a schema change (drop FK, rename column) rather than a value update.

### V2: Pure Clerk Organizations, no in-product table

Skip the in-product Organization entirely. Use Clerk Organizations as the sole organizational model from day one.

**Why not:**

- Creates a hard dependency on the Clerk migration team. Phases 2+ are blocked until Clerk Organizations are available.
- The implementing team can't start delivering product value (switcher, segmented contacts) until Clerk ships.
