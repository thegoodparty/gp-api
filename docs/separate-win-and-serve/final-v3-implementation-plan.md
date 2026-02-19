There are several key milestones in the proposed implementation path of these changes. Overall, this proposed path optimizes for minimizing breaking changes and sensitive deploys as much as possible.

> **Position table note:** The Position table already exists in `election-api` and is owned by the Data team. It holds BallotReady position identity and links to District (which has L2 data). We reference it by storing Position's UUID `id` on Campaign and ElectedOffice as an indexed string column (cross-database, no FK).

> **Clerk dependency note:** Phases 1–3 have no dependency on the Clerk migration. Phase 4 is the Clerk switchover, which can happen whenever the Clerk migration team enables Organizations.

#### **Phase 1: Position links, Organization table, write paths, and backfill**

_Schema_

1. Create the `Organization` table with `id` (UUID PK), `ownerId` (FK to User), `type` (enum: `CAMPAIGN` | `ELECTED_OFFICE`).
2. Add nullable `positionId` String column (indexed, **no FK** — cross-database reference to `election-api` Position.id) on Campaign.
3. Add nullable `positionId` String column (indexed, **no FK**) on ElectedOffice.
4. Add nullable `organizationId` String column (indexed, **no FK**) on Campaign.
5. Add nullable `organizationId` String column (indexed, **no FK**) on ElectedOffice.
6. Add nullable `overrideDistrictId` String column on Campaign (cross-database reference to `election-api` District.id). When set, overrides the district linked via Position.
7. Add nullable `overrideDistrictId` String column on ElectedOffice (same as above).

_Data team coordination_

8. Coordinate with the Data team to add `name` and `normalizedName` fields to the Position table in `election-api`. These are sourced from BallotReady and needed for display in the product switcher and admin UI.

_Write paths_

9. Update the "I won" modal (+ `POST /elected-office`) to:
   - Create an Organization (type: `ELECTED_OFFICE`) for the new ElectedOffice, storing the UUID as `organizationId` on the ElectedOffice.
   - Look up the corresponding Position record (by BallotReady position ID) and store Position.id as `positionId` on the new ElectedOffice.
   - For now, still also set `campaignId` on the new ElectedOffice.
10. Update Campaign creation flows to create an Organization (type: `CAMPAIGN`) and store the UUID as `organizationId` on the Campaign.
11. Update existing office + district selection mechanisms to **double-write**: continue writing BR+L2 data to the existing locations (Campaign `data` JSON / PathToVictory `data` JSON) _and_ set `positionId` (and `overrideDistrictId` when applicable) on Campaign/ElectedOffice:
    - In-Product Office Picker
    - Admin UI District Picker
    - Office selection API endpoint

_Backfill_

12. Backfill `positionId` on Campaign and ElectedOffice by matching existing BR data (from Campaign `data` JSON / PathToVictory `data` JSON) to Position records in `election-api`. Where the existing district differs from the Position's default district, set `overrideDistrictId`.
13. Backfill `Organization` records for all existing Campaigns (type: `CAMPAIGN`) and ElectedOffices (type: `ELECTED_OFFICE`). Populate `organizationId` on each.
14. Make `positionId` and `organizationId` non-nullable on Campaign and ElectedOffice.

**Value Delivered:** Every Campaign and ElectedOffice links to a Position and has an Organization. No Clerk dependency for any of this work.

#### **Phase 2: Product switcher, shared features, and read-path migration**

_Product Switcher + Org Context_

1. Implement `GET /organizations` endpoint — returns the authenticated user's Organizations with their type and linked Campaign/ElectedOffice metadata (name, position label, etc.).
2. Implement the visual product switcher UI in `gp-webapp`, powered by `GET /organizations`. Store the active Organization ID in app state and attach `X-Organization-Id: <uuid>` to every API request via the centralized API client.
3. Create `@UseOrganization()` guard and `@ReqOrganization()` decorator on the backend. The guard reads `X-Organization-Id` from the request header, verifies the Organization belongs to the authenticated user (query by id + ownerId), and attaches the `organizationId` to `request.organizationId`.

_Migrate Read Paths to Position_

4. Identify all gp-api + gp-webapp code paths that read BallotReady or L2 District links from PathToVictory `data` JSON and/or Campaign `data` JSON. Migrate these to read from the Position table in `election-api` (via the stored `positionId`).

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
- The system now uses Position (in `election-api`) as single source-of-truth for BR + L2 links
- Users can switch between "win" and "serve" mode visually in the UI

#### **Phase 3: Cleanup + "New Campaign"**

_Cleanup_

- Remove dual-write paths added in **Phase 1** for setting BR+L2 data on Campaign `data` JSON / PathToVictory `data` JSON.
- Bulk-delete BallotReady + L2 data from Campaign `data` JSON + PathToVictory `data` JSON columns.
- Stop writing `campaignId` onto ElectedOffice and drop `ElectedOffice.campaignId` column entirely.
- Remove `electedOffices` relation from Campaign model.
- Remove any remaining `isPro || hasElectedOffice` checks.

_New Campaign Flow_

- Add new UI to allow creating a new campaign as a Serve user going back into campaign season. This should create a new Organization (type: `CAMPAIGN`) + linked Campaign, with `positionId` set based on the user's office selection.

**Value Delivered:**

- Campaign and ElectedOffice are fully decoupled — no more shared FKs.
- Position (in `election-api`) is the sole source of truth for position/district data — no more dual-writes, no stale copies.
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
