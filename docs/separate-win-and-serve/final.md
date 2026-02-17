**Status:** In Review

# How To Read This Document

This document proposes a direction for how we separate Win and Serve at the data layer.

Before you read, here's what would be most helpful from reviewers at this stage:

- **Does the Organization model make sense as the shared context between Win and Serve?** Is there a better way to represent a user's relationship to a political position, or a reason this approach doesn't work?
- **Does the phased approach feel right?** Are we splitting the work in a way that minimizes risk and delivers value incrementally, or are there dependencies we're missing?
- **Are there impacts to your team's domain that this document doesn't account for?** We've tried to keep the blast radius small, but we want to make sure we're not overlooking something.
- **Are we missing anything?** Are there large blocks of work that don't seem accounted for in this document, but would be required to achieve the desired outcomes?

You don't need to have opinions on all of these — any one of them is valuable. And if your reaction is "this looks fine, I have no concerns," that's useful too.

**_Tip_**_: this document makes heavy use of_ **_subsections_** _-- it may be helpful to use the "collapse" arrows next to major headers to make visual parsing more friendly._

# Overview

Today, **Campaign** is the sole organizing entity across the GoodParty product — every feature, from voter data to AI content to websites, is scoped to a Campaign record. ElectedOffice (the Serve product) is coupled to Campaign via a required foreign key (FK), meaning an elected official can't exist without a campaign, and a user can't hold an office and run for a different position simultaneously.

This document proposes introducing an **Organization** model, a lightweight shared context representing a user's relationship to a political position that either a Campaign or an ElectedOffice becomes a child of. This decouples the two products while _keeping the blast radius small_: only the few truly shared features (voter file filters, contacts access) move to Organization, while the vast majority of Campaign and ElectedOffice code stays untouched.

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
- Multi-user RBAC

# Proposed Solution

There are a few primary technical problems need solving as part of this work:

## Key Problems

1. Today, Campaign+PathToVictory is the source of truth for a user's BallotReady ids and their L2 District. But, both candidates _and_ EOs need a BallotReady position and a matched L2 District. **Since we are separating ElectedOffice and Campaign,** **how will we store + model BR/L2 links for each use case?**
2. Some features (Contacts + future roadmap items) will need to support usage from Win _and_ Serve. **How will we handle foreign key relationships for features that need cross-product support?**
3. With shared features serving both products, **how does the API know which Organization a request is targeting?**
4. Currently, the product does not _really_ support Win users having multiple Campaign objects over time. **What changes are needed to allow a single user to have multiple Campaigns over time?**

## Detailed Design

### The Organization Model

This document proposes a unifying **Organization** model. An Organization represents a user's relationship to a specific political position. It holds the position identity, geography, and matched district data that both Win and Serve need. It is **_not_** a universal parent that replaces Campaign -- rather, it is specifically the shared context for the small set of features used by both products.

```haskell
User (1:many)
  └── Organization
        ├── type: campaign | electedOffice
        ├── position identity (office, level, BallotReady IDs)
        ├── geography (state, city, county, zip)
        ├── L2 district match (districtId, type, name)
        │
        ├── campaign? (1:1, present when type = campaign)
        ├── electedOffice? (1:1, present when type = electedOffice)
        |
        └── voterFileFilters (1:many) — shared feature
```

/
Organizations follow these **key design rules**:

- An Organization has _exactly one "child"_: either a Campaign or an ElectedOffice, never both.
- Feature-specific data foreign-key like so:
  - Win-only features FK to Campaign (unchanged)
  - Serve-only features FK to ElectedOffice (unchanged)
  - Shared features FK to Organization
- A User can have multiple Organizations (e.g., a `campaign` Organization for a state senate run and an `electedOffice` Organization for a current city council position)
- Re-election scenario: a user who holds office and is running for re-election in the same position has **two Organizations** with the same position data — one of type `campaign` and one of type `electedOffice`

#### **Schema (Prisma format)**

```kotlin
enum OrganizationType {
  CAMPAIGN
  ELECTED_OFFICE
}

model Organization {
  id      String   @id @default(uuid())

  owner   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  ownerId Int  @map("owner_id")

  type OrganizationType

  // Children (exactly one, determined by type)
  campaign      Campaign?
  electedOffice ElectedOffice?

  // Shared features
  voterFileFilters VoterFileFilter[]

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

  // L2 district links
  l2DistrictId        String?  @map("l2_district_id")
  l2DistrictType      String?  @map("l2_district_type")
  l2DistrictName      String?  @map("l2_district_name")
  districtManuallySet Boolean  @default(false) @map("district_manually_set")

  @@index([ownerId])
  @@map("organization")
}
```

**What's changing:**

- **New model:** Organization — position/geography/district fields, type enum
- **Campaign:** gains `organizationId` FK, loses `electedOffices` relation
- **ElectedOffice:** gains `organizationId` FK, `campaignId` is removed

**What's NOT changing:**

- All existing Campaign-only relations (website, outreach, AI, P2V, etc.) — still FK to Campaign
- All existing ElectedOffice-only relations (polls, poll messages) — still FK to ElectedOffice
- PathToVictory — still FKs to Campaign
- `@UseCampaign()` — stays for Win-only endpoints
- `@UseElectedOffice()` — stays for Serve-only endpoints

### The `X-Organization-Id` Header and `@UseOrganization()`

With multiple organizations per user, and some features (like Contacts) supporting usage from both Win + Serve, we need _some way to resolve which Organization a particular API request is targeting_. This document proposes introducing a new convention in our API: an `X-Organization-Id` header.

#### How the header works

The frontend stores the user's active Organization selection from their switcher. Our centralized API utilities attach `X-Organization-Id: <id>` to every request automatically. On the server, a `@UseOrganization()` guard reads the header, verifies the Organization belongs to the authenticated user, and attaches it to `request.organization`.

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

### What About Clerk Organizations?

This data model solution is intended to be _complementary_ to our planned future usage of [Clerk Organizations](https://clerk.com/docs/guides/organizations/overview) to support multi-user membership of orgs and customizable access control. When we reach the point of needing Clerk Organizations, this proposal expects a 1:1 relationship between in-product Organizations and Clerk Organizations. In fact, it may be simplest to simply re-use the same `id` between each resource for system simplicity.

## Implementation Path (summarized)

There are several key milestones in the proposed implementation path of these changes. Overall, this proposed path optimizes for minimizing breaking changes and sensitive deploys as much as possible.

A more detailed implementation path is contained in the [subdoc](https://goodparty.clickup.com/90132012119/v/dc/2ky4jq2q-20493/2ky4jq2q-32153). You don't need to read this quite yet.

### Phase 1: Schema, org write path, and initial backfill

- Create the Organization table
- Establish FK relationships on Campaign and ElectedOffice
- Update key write paths (office selection, district pickers, "I won" flow) to double-write BR+L2 data onto both Campaign and Organization
- Backfill Organization records for all existing users, then make organizationId non-nullable.

**Value Delivered**: Organization model is established and can now be read as a source-of-truth for BR+L2 fields. All existing and new users will have an Organization.

### Phase 2: Migrate Contacts and Read Paths onto Organization

- Implement the product switcher UI, powered by `GET /organizations` and the `X-Organization-Id` header.
- Migrate all code paths that read BR+L2 data from Campaign/PathToVictory to read from Organization instead.
- Move VoterFileFilter onto Organization and update Contacts access-checking rules.
- Update Profile and Admin UI to allow modifying offices and districts on multiple Organizations for a single user.

**Value Delivered**: Contact filters are now segmented by Organization. The system uses Organization as the single source-of-truth for BR+L2 links. Users can switch between "win" and "serve" mode in the UI.

### Phase 3: Cleanup + "New Campaign"

- Remove dual-write paths from Phase 1
- Drop deprecated columns (campaignId on ElectedOffice, BR+L2 fields on Campaign/P2V), and clean up legacy access checks.
- Add a flow for Serve users to create a new Campaign, producing a new Organization.

**Value Delivered**: Campaign and ElectedOffice are fully decoupled -- no more shared FKs. Organization is the sole source of truth for position/district data. Serve users can move seamlessly back into Campaign mode.

## Key Takeaways

- **Organization is small by design**. It holds position, geography, and district data. It is the FK target only for the few features shared between Win and Serve — it is not a universal parent entity that replaces Campaign.
- **An Organization has exactly one child** — either a Campaign or an ElectedOffice, never both.
- **Existing routes and guards don't change**, which limits blast radius. `@UseCampaign()` and `@UseElectedOffice()` stay as-is. Only shared features get a new `@UseOrganization()` guard.
- **The implementation is** **phased for safety**. Dual-write and single-read transitions maximize reverse-ability, and each subsequent phase delivers value incrementally.
- **ElectedOffice independence is the "north star" milestone**. Once ElectedOffice has its own Organization, an official can exist without a campaign, and a user can hold one office while running for a different position.

# Open Questions

- Rather than have the the BR + L2 position data on Organization, should we introduce a single "Position" table with BR + L2 links for a particular BR position, and only store e.g. `positionId` on Organization?

- What is the right place for the updated admin UI to modify office + district data on an Organization -- gp-admin, or the existing Admin UI?

- What does this mean for sync of data to HubSpot?

# Alternatives Considered

### No shared model, just keep using ElectedOffice and Campaign

Campaign and ElectedOffice each get their own position/district fields. No shared Organization model. Shared features accept `campaignId | electedOfficeId` polymorphically.

**Why not:**

- Designing foreign keys for shared features becomes a small pain and a source of boilerplate. You need to support a campaignId _or_ an electedOfficeId foreign key on any related tables. Complexity grows with each new shared feature. If new shared features become interconnected at the data model layer, complexity begins to escalate _very_ quickly.
- We duplicate management of BR+L2 data.
- There's no natural entity for the product switcher or future RBAC.

### Just use pure Clerk Organizations

Use Clerk Organizations as the sole organizational model, skipping the in-product Organization table entirely.

**Why not:**
We still need a first-class entity in our database to hold position/geography/district data and FK shared features to. Coupling our core data model to an external service's schema creates a dependency risk. The proposed approach is complementary — our Organization model holds the data, and Clerk Organizations (when we adopt them) handle the auth/membership layer on top.
