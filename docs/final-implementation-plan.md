There are several key milestones in the proposed implementation path of these changes. Overall, this proposed path optimizes for minimizing breaking changes and sensitive deploys as much as possible.

#### **Phase 1: Schema, org write path, and initial backfill**

1. Create the Organization table and wire up nullable FK relationships on Campaign and ElectedOffice
2. Update the following key write paths to ensure Organizations are created + updated with Campaigns and ElectedOffices:
   - Update the "I won" modal (+ `POST /elected-office`) to create a paired Organization for the new ElectedOffice. For now, still also set `campaignId` on the new ElectedOffice.
   - Update the office selection API endpoint to start also modifying the BR + L2 fields on Organization
   - Update existing office + district selection mechanisms to **double-write** the associated Campaign _and_ Organization BR+L2 fields:
     - In-Product Office Picker
     - Admin UI District Picker
3. Backfill Organization records for existing Campaign + ElectedOffice records
4. Now make `organizationId` non-nullable on Campaign + ElectedOffice

**Value Delivered:** Organization model is established, and can now be read as a source-of-truth for the BR+L2 fields. And, all existing and new users will have an Organization.

#### **Phase 2: Migrate Contacts and Read Paths onto Organization**

_Migrate Read Paths onto Organization_

1. Implement the visual product switcher UI in `gp-webapp`, powered by `GET /organizations` and linked to `X-Organization-Id` header.
2. Create `@UseOrganization()` guard and `@ReqOrganization()` decorator, powered by `X-Organization-Id` header.
3. Identify all gp-api + gp-webapp code paths that read BallotReady or L2 District links from PathToVictory and/or Campaign. Migrate these to use `Organization`.

_Migrate Contacts onto Organization_

1. Add nullable `organizationId` FK column to VoterFileFilter table.
2. Update write path for new filters to set `organizationId` for new filters.
3. Backfill `organizationId` onto existing VoterFileFilter records
4. Begin listing segments using X-Organization-Id and update access-checking rules (Serve users see all data except Political Party, Win users must go pro).
5. Make organizationId non-nullable and remove VoterFileFilter.campaignId column.

**Value Delivered:**

- Contact filters are now segmented by Organization
- The system now uses Organization as single source-of-truth for BR + L2 links
- Users can switch between "win" and "serve" mode visually in the UI.

#### Phase 3: Cleanup + "New Campaign"

_Cleanup_

- Remove dual-write paths added in **Phase 1** for setting BR+L2 data on Campaign/P2V.
- Bulk-delete BallotReady + L2 data from Campaign + PathToVictory records
- Stop writing `campaignId` onto ElectedOffice and drop `ElectedOffice.campaignId` column entirely.
- Remove `electedOffices` relation from Campaign model
- Remove any remaining `isPro || hasElectedOffice` checks

_New Campaign Flow_

- Add new UI to allow creating a new campaign as a Serve user going back into campaign season. This should create a new Organization + linked Campaign.

**Value Delivered:**

- Campaign and ElectedOffice are fully decoupled - no more shared FKs.
- Organization is the sole source of truth for position/district data - no more dual-writes, no stale copies
- Serve users can move seamlessly back into Campaign mode.
