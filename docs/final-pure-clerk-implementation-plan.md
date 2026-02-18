There are several key milestones in the proposed implementation path of these changes. Overall, this proposed path optimizes for minimizing breaking changes and sensitive deploys as much as possible.

> **Naming note:** The codebase already has a `Position` model (campaign issue stances). The new table proposed here — representing a BallotReady political office and its L2 district links — will use the name `BallotPosition` to avoid collision. The design doc refers to this conceptually as "Position."

> **Clerk dependency note:** Phase 1 has no dependency on the Clerk migration. Phases 2 and 3 require Clerk Organizations to be available. The Phase 1 work can begin immediately and run in parallel with the Clerk migration team's work.

#### **Phase 1: BallotPosition table, write paths, and backfill**

_Schema_

1. Create the `BallotPosition` table, keyed by BallotReady `positionId` (String PK). Columns: `office`, `ballotLevel`, `level`, `state`, `county`, `city`, `district`, `zip`, `l2DistrictId`, `l2DistrictType`, `l2DistrictName`.
2. Add nullable `positionId` FK on Campaign pointing to `BallotPosition`.
3. Add nullable `positionId` FK on ElectedOffice pointing to `BallotPosition`.
4. Add `districtManuallySet` Boolean column to ElectedOffice (this flag describes a user's override, not the position itself, so it lives here rather than on `BallotPosition`).

_Write paths (double-write)_

5. Update the "I won" modal (+ `POST /elected-office`) to upsert a `BallotPosition` record and set `positionId` on the new ElectedOffice. For now, still also set `campaignId` on the new ElectedOffice.
6. Update existing office + district selection mechanisms to **double-write** the associated BR+L2 data to both the existing locations (Campaign `data` JSON / PathToVictory `data` JSON) _and_ the `BallotPosition` table:
   - In-Product Office Picker
   - Admin UI District Picker
   - Office selection API endpoint

_Backfill_

7. Backfill `BallotPosition` records from existing Campaign + PathToVictory data. Populate `positionId` on Campaign and ElectedOffice.
8. Make `positionId` non-nullable on Campaign and ElectedOffice.

**Value Delivered:** BallotPosition table is established and can now be read as a source-of-truth for BR+L2 fields. All existing and new Campaigns and ElectedOffices have a linked BallotPosition. _No Clerk dependency for any of this work._

#### **Phase 1b: Clerk Organization provisioning** _(parallel, begins when Clerk Organizations are available)_

1. Add nullable `clerkOrganizationId` (String) column to Campaign and ElectedOffice. Add index on this column for both tables.
2. Wire up "I won" flow (`POST /elected-office`) to also create a Clerk Organization (via `@clerk/backend` SDK) for the new ElectedOffice, storing the returned `org_id` as `clerkOrganizationId`. Set `publicMetadata` with `{ type: "electedOffice", positionId }`.
3. Wire up Campaign creation / office selection flows to create a Clerk Organization for the Campaign, storing `clerkOrganizationId`. Set `publicMetadata` with `{ type: "campaign", positionId }`.
4. Backfill: create Clerk Organizations for all existing Campaign + ElectedOffice records, storing the returned `org_id` on each record.
5. Make `clerkOrganizationId` non-nullable on Campaign and ElectedOffice.

**Value Delivered:** Every Campaign and ElectedOffice has a corresponding Clerk Organization. The link is stored and queryable. Product switcher and shared features can now be built.

#### **Phase 2: Product switcher, shared features, and read-path migration**

_Product Switcher + Org Context_

1. Implement the visual product switcher UI in `gp-webapp` using Clerk's `<OrganizationSwitcher />` component or a custom switcher built on `useOrganizationList()` + `setActive()`. The switcher reads `publicMetadata.type` to render campaign vs. elected office labels/icons.
2. Create `@UseOrganization()` guard and `@ReqOrganization()` decorator on the backend. The guard reads the active org ID from the Clerk JWT's `o.id` claim and attaches it to the request as `request.clerkOrganizationId`.

_Migrate Read Paths to BallotPosition_

3. Identify all gp-api + gp-webapp code paths that read BallotReady or L2 District links from PathToVictory `data` JSON and/or Campaign `data` JSON. Migrate these to read from `BallotPosition` (via `campaign.position` or `electedOffice.position` relation).

_Migrate Contacts / VoterFileFilter onto Clerk Organization_

4. Add nullable `clerkOrganizationId` (String) column to `VoterFileFilter`. Add index on `clerkOrganizationId`.
5. Update write path for new filters to set `clerkOrganizationId` (read from the JWT via the `@UseOrganization()` guard).
6. Backfill `clerkOrganizationId` onto existing VoterFileFilter records (derived from the VoterFileFilter's current `campaignId` → Campaign's `clerkOrganizationId`).
7. Switch VoterFileFilter listing endpoints to use `@UseOrganization()` guard and filter by `clerkOrganizationId`. Update access-checking rules (Serve users see all data except Political Party, Win users must go pro).
8. Make `clerkOrganizationId` non-nullable on VoterFileFilter and drop the `campaignId` column + its indexes.

_Admin + Profile_

9. Update Profile and Admin UI to allow modifying offices and districts across multiple Campaigns/ElectedOffices for a single user.

**Value Delivered:**

- Contact filters are now segmented by Clerk Organization
- The system now uses BallotPosition as single source-of-truth for BR + L2 links
- Users can switch between "win" and "serve" mode visually in the UI via the Clerk-powered switcher

#### Phase 3: Cleanup + "New Campaign"

_Cleanup_

- Remove dual-write paths added in **Phase 1** for setting BR+L2 data on Campaign `data` JSON / PathToVictory `data` JSON.
- Bulk-delete BallotReady + L2 data from Campaign `data` JSON + PathToVictory `data` JSON columns.
- Stop writing `campaignId` onto ElectedOffice and drop `ElectedOffice.campaignId` column entirely.
- Remove `electedOffices` relation from Campaign model.
- Remove any remaining `isPro || hasElectedOffice` checks.

_New Campaign Flow_

- Add new UI to allow creating a new campaign as a Serve user going back into campaign season. This should create a new Clerk Organization + linked Campaign + BallotPosition record.

**Value Delivered:**

- Campaign and ElectedOffice are fully decoupled — no more shared FKs.
- BallotPosition is the sole source of truth for position/district data — no more dual-writes, no stale copies.
- Serve users can move seamlessly back into Campaign mode.
