## Overview

Today, Campaign is the sole organizing entity across the entire GoodParty product. ElectedOffice (the Serve product) is coupled to Campaign via a required FK, meaning an elected official can't exist without a campaign, and a user can't hold an office and run for a different one simultaneously. We propose introducing an **Organization** model — a lightweight shared context representing a user's relationship to a political position — that either a Campaign or an ElectedOffice becomes a child of. This decouples the two products while keeping the blast radius small: only the few truly shared features (voter file filters, contacts access) move to Organization, while the vast majority of Campaign and ElectedOffice code stays untouched.

## Key Product Outcomes

- Allow visually switching between "campaign" mode and "elected official" mode in the product. Each will have a separate filtered list of nav items (to be decided by product).
- Allow an elected official to transition _back_ into campaign mode, by creating a new campaign with a _separate_ district from their current elected office.
- A user should be able to go through the campaign → serve → campaign cycle _without_ needing to create a new user account (for their 2nd campaign).
- Users should see a _separate_ list of custom segments for their campaign and elected offices, when viewing the Contacts page.
- When in "elected official" mode, users should NOT be able to see Political Party information about constituents on the Contacts page.

## Key Technical Outcomes

- Break the FK relationship between Campaign ↔ ElectedOffice.
- Conceptually support multiple Campaign records over time for a single user.
- Establish conventions for modeling data relationships for features that fall into each of these categories:
  - Features that are specific to Win
  - Features that are specific to Serve
  - Features that span both use cases

## Not In Scope

- Supporting onboarding new elected officials that did not get elected using Win.

## Proposed Solution

There are three primary technical problems that arise

#### Key Problems

1. Today, Campaign+PathToVictory is the source of truth for a user's BallotReady ids and their L2 District. But, both candidates _and_ EOs need a BallotReady position and a matched L2 District. **Since we are separating ElectedOffice and Campaign,** **how will we store + model BR/L2 links for each use case?**
2. Some features (Contacts + future roadmap items) will need to support usage from Win _and_ Serve. **How will we handle foreign key relationships for features that need cross-product support?**
3. Currently, the product does not _really_ support Win users having multiple Campaign objects over time. **What changes are needed to allow a single user to have multiple Campaigns over time?**

#### Detailed Design

##### The Organization Model

An **Organization** represents a user's relationship to a specific political position. It holds the position identity, geography, and matched district data that both Win and Serve need. It is _not_ a universal parent that replaces Campaign — it is specifically the shared context for the small set of features used by both products.

```
User (1:many)
  └── Organization
        ├── type: campaign | electedOffice
        ├── position identity (office, level, BallotReady IDs)
        ├── geography (state, city, county, zip)
        ├── L2 district match (districtId, type, name)
        │
        ├── campaign? (1:1, present when type = campaign)
        ├── electedOffice? (1:1, present when type = electedOffice)
        └── voterFileFilters (1:many) — shared feature
```

**Key design rules:**

- An Organization has exactly **one** child: either a Campaign or an ElectedOffice, never both. A `type` enum field enforces this.
- Win-only features FK to **Campaign** (unchanged)
- Serve-only features FK to **ElectedOffice** (unchanged)
- Shared features FK to **Organization**
- `isPro` stays on Campaign; ElectedOffice access is gated by existence of the record
- A User can have multiple Organizations (e.g., a `campaign` Organization for a state senate run and an `electedOffice` Organization for a current city council position)
- Re-election scenario: a user who holds office and is running for re-election in the same position has **two Organizations** with the same position data — one of type `campaign` and one of type `electedOffice`

##### Schema

```prisma
enum OrganizationType {
  CAMPAIGN
  ELECTED_OFFICE
}

model Organization {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  owner   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ownerId Int  @map("owner_id")

  type OrganizationType

  // BallotReady position data
  positionId  String?                    @map("position_id")
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

  // Children (exactly one, determined by type)
  campaign      Campaign?
  electedOffice ElectedOffice?

  // Shared features
  voterFileFilters VoterFileFilter[]

  @@index([ownerId])
  @@map("organization")
}
```

The `type` field determines which child relation is populated. Application-level validation enforces that only the matching child exists (e.g., an Organization with `type = campaign` must have a Campaign and no ElectedOffice).

**Changes to existing models:**

```prisma
model Campaign {
  // All existing fields unchanged

  // NEW
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String       @unique @map("organization_id")

  // REMOVED
  // electedOffices relation (moved to Organization)
}

model ElectedOffice {
  // All existing fields unchanged

  // NEW
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String       @unique @map("organization_id")

  // DEPRECATED (nullable during migration, removed in Phase 4)
  campaignId String? @map("campaign_id")
}

model VoterFileFilter {
  // All existing filter columns unchanged

  // NEW
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  organizationId String       @map("organization_id")

  // DEPRECATED (nullable during migration, removed in Phase 4)
  campaignId Int? @map("campaign_id")
}
```

**What's changing:**

- **New model:** Organization — position/geography/district fields, type enum
- **Campaign:** gains `organizationId` FK, loses `electedOffices` relation
- **ElectedOffice:** gains `organizationId` FK, `campaignId` becomes nullable (deprecated)
- **VoterFileFilter:** gains `organizationId` FK, `campaignId` becomes nullable (deprecated)

**What's NOT changing:**

- `campaign.details` JSON — untouched
- All Campaign-only relations (website, outreach, AI, P2V, etc.) — still FK to Campaign
- All ElectedOffice-only relations (polls, poll messages) — still FK to ElectedOffice
- PathToVictory — still FKs to Campaign
- `isPro` — stays on Campaign
- `@UseCampaign()` — stays for Win-only endpoints
- `@UseElectedOffice()` — stays for Serve-only endpoints

##### Phased Implementation

**Phase 1: Schema + Backfill**

Goal: Create the Organization table and wire up FK relationships without changing any application behavior.

1. Create `Organization` table with all position/geography/district columns
2. Add nullable `organizationId` column to Campaign, ElectedOffice, and VoterFileFilter
3. Run backfill migration:
   - For each existing Campaign, create an Organization with `type = campaign`, populated from `campaign.details` JSON (office, state, city, county, zip, positionId, raceId, ballotLevel, level, district) and `pathToVictory.data` JSON (districtId → l2DistrictId, electionType → l2DistrictType, electionLocation → l2DistrictName, districtManuallySet). Set `campaign.organizationId` to the new Organization.
   - For each existing ElectedOffice, create a **separate** Organization with `type = electedOffice`, copying position/geography data from the linked Campaign's Organization. Set `electedOffice.organizationId` to this new Organization.
   - For each existing VoterFileFilter, set `voterFileFilter.organizationId` to the Campaign's Organization (these are all Win-originated today)
4. Make `organizationId` non-nullable on all three tables
5. Add indexes

Value delivered: None yet (foundation only). But this is deployable independently with zero application changes.

**Phase 2: Shared Features Move to Organization**

Goal: Voter file filters and contacts access use Organization instead of Campaign. ElectedOffice no longer needs Campaign for shared features.

1. Create `OrganizationService` with basic CRUD and lookup methods
2. Create `@UseOrganization()` guard and `@ReqOrganization()` decorator
3. Update VoterFileFilter service to read/write `organizationId` instead of `campaignId`
4. Update voter file filter endpoints to use `@UseOrganization()`
5. Update contacts search/download access check: instead of `isPro || hasElectedOffice`, check via Organization:
   - `type === 'electedOffice'` → access granted
   - `type === 'campaign' && campaign.isPro` → access granted
   - otherwise → denied
6. Frontend: update `ContactsTableProvider` to derive `canUseProFeatures` from Organization context

Value delivered: Voter file filters are now associated with an Organization. An elected official's voter filters persist independently of any Campaign.

**Phase 3: ElectedOffice Independence + Product Switcher**

Goal: ElectedOffice creation produces its own Organization. Users can hold office and run for a different position. Frontend product switcher is live.

1. Make `campaignId` nullable on ElectedOffice (already done in schema, now enforce in application)
2. Update `POST /elected-office` ("I won" flow) — the sole entry point for creating an ElectedOffice. Today it finds the user's Campaign, creates an ElectedOffice linked to it, and returns. After this change, it also creates a new Organization with `type = electedOffice`, copying position/geography data from the Campaign's Organization, and links the new ElectedOffice to it. The Campaign FK on ElectedOffice becomes optional and is no longer set.
3. Update poll creation — currently auto-creates an ElectedOffice linked to a Campaign (marked TEMPORARY). Instead, auto-creates an Organization and ElectedOffice using the same pattern as step 2.
4. Add `GET /organizations` endpoint to power the product switcher
5. Add `x-organization-id` header convention for `@UseOrganization()` guard (falls back to user's sole Organization when absent)
6. Frontend: add `OrganizationProvider` with product switcher component

Value delivered: Users can hold office in one Organization (type `electedOffice`) and run for a different position in another Organization (type `campaign`). Product switcher lets users toggle between organizations. ElectedOffice is fully independent of Campaign.

**Phase 4: Cleanup**

1. Remove nullable `campaignId` from ElectedOffice
2. Remove nullable `campaignId` from VoterFileFilter
3. Remove `electedOffices` relation from Campaign model
4. Remove any remaining `isPro || hasElectedOffice` checks
5. Drop old indexes on removed columns

**Future: Multi-User RBAC**

When team member access is needed, Organization is the natural anchor point. One membership record per user per Organization — access to Campaign or ElectedOffice flows through the Organization, so there's no need for parallel membership tables.

##### What This Avoids Touching

- **`@UseCampaign()` routes (16 controllers):** All Win-only features continue using `@UseCampaign()`. No changes.
- **`@UseElectedOffice()` routes (polls, contact engagement):** All Serve-only features continue using `@UseElectedOffice()`. No changes.
- **`campaign.details` JSON:** Not extracted or restructured. Organization has its own columns; `details` keeps its existing fields.
- **PathToVictory:** Stays FK'd to Campaign. L2 district data is duplicated to Organization — Organization is the live source of truth, P2V keeps its copy as part of the historical win-number calculation.
- **Payments / Stripe:** `isPro` stays on Campaign. No billing changes.
- **Queue / async jobs:** Continue routing by `campaignId`. No changes.

#### Key Takeaways

- **Organization is small by design.** It holds only position/geography/district data and is the FK target only for the few shared features. It is not a universal parent entity.
- **An Organization has exactly one child** — either a Campaign or an ElectedOffice, never both. The `type` enum enforces this at the data level.
- **The shared surface area between Win and Serve is only ~4 features.** Most features are already clearly one product or the other, so the migration blast radius is small.
- **Existing routes don't change.** `@UseCampaign()` and `@UseElectedOffice()` stay as-is. Only the shared features get a new `@UseOrganization()` guard.
- **Phase 1 is pure infrastructure** with zero application behavior changes, making it safe to deploy early.
- **ElectedOffice independence is the key unlock.** Once ElectedOffice FKs to its own Organization instead of Campaign, an official can exist without a campaign, and a user can hold one office while running for a different position.
- **`isPro` stays on Campaign.** Serve access is gated by ElectedOffice existence. No billing model changes needed now.
- **Multi-user RBAC attaches to Organization later.** One membership table, one invite flow — no need for parallel team systems.

## FAQs

#### What About Clerk Organizations?

This data model solution is intended to be _complementary_ to our planned future usage of [Clerk Organizations](https://clerk.com/docs/guides/organizations/overview) to support multi-user membership of orgs and customizable access control. When we reach the point of needing Organizations, this proposal expects a 1:1 relationship between in-product Organizations and Clerk Organizations. In fact, it may be simplest to simply re-use the same `id` between each resource for system simplicity.

## Open Questions

#### BR/L2 Data Modeling

Every BallotReady position shares the same set of metadata fields (office, level, state, city, county, district, etc.) regardless of whether it's for a candidate or an elected official. These fields live on the Organization model, giving both products a single source of truth for position/geography data.

The open question is the _write path_: when P2V recalculates or a user manually sets their district, do we write to both Organization and `pathToVictory.data`? Or does P2V start reading from Organization? The recommendation is that Organization becomes the live source of truth for district data going forward, and P2V keeps its copy as part of the historical win-number calculation — but the exact write path needs to be defined during Phase 2 implementation.

## Alternatives Considered

#### No Shared Model, duplicate FK work

Campaign and ElectedOffice each get their own position/district fields. No Organization model. Shared features accept `campaignId | electedOfficeId` polymorphically.

**Why we rejected it:** Shared features need a polymorphic pattern that leaks into service signatures, queue messages, and DB queries. There's no natural entity for the product switcher or future RBAC. The polymorphic approach creates complexity that grows with each new shared feature.

#### Pure Clerk Organizations

Use Clerk Organizations as the sole organizational model, skipping the in-product Organization table entirely.

**Why we rejected it:** Clerk Organizations are an auth/access construct, not a data model. We still need a first-class entity in our database to hold position/geography/district data and FK shared features to. Coupling our core data model to an external service's schema creates a dependency risk. The proposed approach is complementary — our Organization model holds the data, and Clerk Organizations (when we adopt them) handle the auth/membership layer on top.
