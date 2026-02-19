There are several key milestones in the proposed implementation path of these changes. Overall, this proposed path optimizes for minimizing breaking changes and sensitive deploys as much as possible.

> **Naming note:** The codebase already has a `Position` model (campaign issue stances). The new table proposed here — representing a BallotReady political office and its L2 district links — will use the name `BallotPosition` to avoid collision.

> **Clerk dependency note:** Phases 1–3 have no dependency on the Clerk migration. Phase 4 is the Clerk switchover, which can happen whenever the Clerk migration team enables Organizations.

#### **Phase 1: BallotPosition table, Organization table, write paths, and backfill**

_Schema_

1. Create the `BallotPosition` table, keyed by BallotReady `positionId` (String PK). Columns: `office`, `ballotLevel`, `level`, `state`, `county`, `city`, `district`, `zip`, `l2DistrictId`, `l2DistrictType`, `l2DistrictName`.
2. Create the `Organization` table with `id` (UUID PK), `ownerId` (FK to User), `type` (enum: `CAMPAIGN` | `ELECTED_OFFICE`).
3. Add nullable `positionId` FK on Campaign pointing to `BallotPosition`.
4. Add nullable `positionId` FK on ElectedOffice pointing to `BallotPosition`.
5. Add nullable `organizationId` String column (indexed, **no FK**) on Campaign.
6. Add nullable `organizationId` String column (indexed, **no FK**) on ElectedOffice.
7. Add `districtManuallySet` Boolean column to ElectedOffice.

_Write paths (double-write)_

8. Update the "I won" modal (+ `POST /elected-office`) to:
   - Create an Organization (type: `ELECTED_OFFICE`) for the new ElectedOffice, storing the UUID as `organizationId` on the ElectedOffice.
   - Upsert a `BallotPosition` record and set `positionId` on the new ElectedOffice.
   - For now, still also set `campaignId` on the new ElectedOffice.
9. Update Campaign creation flows to create an Organization (type: `CAMPAIGN`) and store the UUID as `organizationId` on the Campaign.
10. Update existing office + district selection mechanisms to **double-write** the associated BR+L2 data to both the existing locations (Campaign `data` JSON / PathToVictory `data` JSON) _and_ the `BallotPosition` table:
    - In-Product Office Picker
    - Admin UI District Picker
    - Office selection API endpoint

_Backfill_

11. Backfill `BallotPosition` records from existing Campaign + PathToVictory data. Populate `positionId` on Campaign and ElectedOffice.
12. Backfill `Organization` records for all existing Campaigns (type: `CAMPAIGN`) and ElectedOffices (type: `ELECTED_OFFICE`). Populate `organizationId` on each.
13. Make `positionId` and `organizationId` non-nullable on Campaign and ElectedOffice.

**Value Delivered:** BallotPosition table is established as the source-of-truth for BR+L2 fields. Every Campaign and ElectedOffice has an Organization. No Clerk dependency for any of this work.

#### **Phase 2: Product switcher, shared features, and read-path migration**

_Product Switcher + Org Context_

1. Implement `GET /organizations` endpoint — returns the authenticated user's Organizations with their type and linked Campaign/ElectedOffice metadata (name, position label, etc.).
2. Implement the visual product switcher UI in `gp-webapp`, powered by `GET /organizations`. Store the active Organization ID in app state and attach `X-Organization-Id: <uuid>` to every API request via the centralized API client.
3. Create `@UseOrganization()` guard and `@ReqOrganization()` decorator on the backend. The guard reads `X-Organization-Id` from the request header, verifies the Organization belongs to the authenticated user (query by id + ownerId), and attaches the `organizationId` to `request.organizationId`.

_Migrate Read Paths to BallotPosition_

4. Identify all gp-api + gp-webapp code paths that read BallotReady or L2 District links from PathToVictory `data` JSON and/or Campaign `data` JSON. Migrate these to read from `BallotPosition` (via `campaign.position` or `electedOffice.position` relation).

_Migrate Contacts / VoterFileFilter onto Organization_

5. Add nullable `organizationId` String column (indexed, **no FK**) to VoterFileFilter. Add composite index on `[id, organizationId]`.
6. Update write path for new filters to set `organizationId` (read from `request.organizationId` via the `@UseOrganization()` guard).
7. Backfill `organizationId` onto existing VoterFileFilter records (derived from VoterFileFilter's current `campaignId` → Campaign's `organizationId`).
8. Switch VoterFileFilter listing endpoints to use `@UseOrganization()` guard and filter by `organizationId`. Update access-checking rules (Serve users see all data except Political Party, Win users must go pro).
9. Make `organizationId` non-nullable on VoterFileFilter and drop the `campaignId` column + its indexes.

_Admin + Profile_

10. Update Profile and Admin UI to allow modifying offices and districts across multiple Campaigns/ElectedOffices for a single user.

**Value Delivered:**

- Contact filters are now segmented by Organization
- The system now uses BallotPosition as single source-of-truth for BR + L2 links
- Users can switch between "win" and "serve" mode visually in the UI

#### **Phase 3: Cleanup + "New Campaign"**

_Cleanup_

- Remove dual-write paths added in **Phase 1** for setting BR+L2 data on Campaign `data` JSON / PathToVictory `data` JSON.
- Bulk-delete BallotReady + L2 data from Campaign `data` JSON + PathToVictory `data` JSON columns.
- Stop writing `campaignId` onto ElectedOffice and drop `ElectedOffice.campaignId` column entirely.
- Remove `electedOffices` relation from Campaign model.
- Remove any remaining `isPro || hasElectedOffice` checks.

_New Campaign Flow_

- Add new UI to allow creating a new campaign as a Serve user going back into campaign season. This should create a new Organization (type: `CAMPAIGN`) + linked Campaign + BallotPosition record.

**Value Delivered:**

- Campaign and ElectedOffice are fully decoupled — no more shared FKs.
- BallotPosition is the sole source of truth for position/district data — no more dual-writes, no stale copies.
- Serve users can move seamlessly back into Campaign mode.

#### **Phase 4: Migrate to Clerk Organizations**

_This phase can happen whenever Clerk Organizations become available. It has no dependency on Phases 1–3 being recently completed — the system is stable after Phase 3 and can run on the in-product Organization table indefinitely._

_Backfill Clerk Organizations_

1. For each in-product Organization, call `createOrganization()` via the `@clerk/backend` SDK:
   - Set `name` to a display label (e.g., "State Senate District 14 — Campaign").
   - Set `slug` to the in-product Organization's UUID (e.g., `550e8400-e29b-41d4-a716-446655440000`). UUIDs are valid Clerk slugs (lowercase hex + dashes).
   - Set `publicMetadata` with `{ type: "campaign" | "electedOffice", positionId: "..." }`.
   - Set `createdBy` to the Clerk user ID corresponding to the Organization's owner.

2. Wire up Organization creation flows (Campaign creation, "I won" modal) to also create a Clerk Organization with slug = the in-product Organization UUID. This ensures new Organizations created after the backfill also have corresponding Clerk orgs.

_Swap the backend guard_

3. Update `@UseOrganization()` guard to read `o.slg` from the Clerk JWT instead of reading the `X-Organization-Id` header. Since the slug _is_ the in-product Organization UUID, the guard produces the exact same `request.organizationId` value. All downstream route handlers are unaffected. **No data migration is needed** — the `organizationId` values stored in Campaign, ElectedOffice, VoterFileFilter, and any other tables remain unchanged.

_Swap the frontend_

4. Replace the custom product switcher (powered by `GET /organizations` + local state) with either:
   - Clerk's `<OrganizationSwitcher />` component, or
   - A custom switcher built on `useOrganizationList()` + `setActive()` (if we need more visual control).
5. Remove the `X-Organization-Id` header attachment from the frontend's centralized API client. Clerk's session token now carries the org context automatically.

_Drop the Organization table_

6. Remove the `Organization` Prisma model, service, controller, and `GET /organizations` endpoint.
7. Remove any remaining references to the in-product Organization in application code.

**Value Delivered:**

- The system is in the pure Clerk state.
- No in-product Organization table. No custom header. No custom product switcher data fetching.
- Clerk handles org context (via JWT), switching (via SDK), and is ready for future RBAC.
- Zero data migration was required — the `organizationId` columns throughout the system still contain the original UUIDs, which Clerk resolves via the org slug.
