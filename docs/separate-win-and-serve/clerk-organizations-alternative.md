# Separating Win and Serve: Pure Clerk Organizations Approach

**Status:** Draft / Alternative (not recommended)
**Author:** [your name]
**Date:** 2026-02-11
**Teams Affected:** Win (Candidates), Serve (Elected Officials), Platform/Infra

## Summary

This document explores an alternative to the [Seat model design](./design.md) that uses **Clerk Organizations** as the primary mechanism for separating Win and Serve. Instead of introducing a new `Seat` table in our database, each Campaign and each ElectedOffice would be represented as a Clerk Organization. Clerk's built-in organization switching, membership, and session context would replace the custom `x-seat-id` header, `@UseSeat()` guard, and product switcher described in the Seat design.

**This document exists for comparison purposes.** Our recommendation is to **not** pursue this approach — see [Why We Don't Recommend This](#why-we-dont-recommend-this) at the end.

## Background: What Are Clerk Organizations?

Clerk Organizations are a multi-tenancy primitive designed for B2B SaaS (think Slack workspaces, Vercel teams). Key properties:

- A user can belong to **multiple** Organizations simultaneously
- One Organization is "active" at a time — the active org ID is embedded in the session token
- Clerk middleware puts `orgId`, `orgRole`, and `orgPermissions` on `req.auth` automatically
- Organizations have `publicMetadata` and `privateMetadata` (JSON) for custom data
- Built-in RBAC: roles, custom permissions, invitation system
- Frontend: `<OrganizationSwitcher />` component, `useOrganization()` / `useOrganizationList()` hooks
- Backend: `clerkClient.organizations.*` CRUD API

## Proposed Design

### 1. Core Concept

Every Campaign and every ElectedOffice gets a corresponding Clerk Organization. The Clerk Organization serves as the **identity and switching layer** — it's what the user selects in the product switcher, and it's what scopes API requests via the session token.

```
User
  ├── Clerk Org (type: campaign)     → linked to Campaign record in our DB
  ├── Clerk Org (type: campaign)     → linked to another Campaign record
  └── Clerk Org (type: electedOffice) → linked to ElectedOffice record in our DB
```

The "active organization" in Clerk's session determines which product context the user is operating in. No `x-seat-id` header needed — Clerk's middleware provides `req.auth.orgId` on every request.

### 2. Schema Changes

Campaign and ElectedOffice each get a `clerkOrgId` column linking them to their Clerk Organization:

```prisma
model Campaign {
  // All existing fields unchanged

  // NEW: link to Clerk Organization
  clerkOrgId String @unique @map("clerk_org_id")

  // Position/geography data — duplicated from Clerk org metadata
  // so it's queryable and has proper types
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

  // REMOVED: electedOffices relation
}

model ElectedOffice {
  // All existing fields unchanged

  // NEW: link to Clerk Organization
  clerkOrgId String @unique @map("clerk_org_id")

  // Position/geography data — duplicated from Campaign at creation time
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

  // DEPRECATED: kept nullable during migration, removed later
  campaignId Int? @map("campaign_id")
}

model VoterFileFilter {
  // All existing filter columns unchanged

  // NEW: scoped to a Clerk Organization
  clerkOrgId String @map("clerk_org_id")

  // DEPRECATED: kept nullable during migration, removed later
  campaignId Int? @map("campaign_id")

  @@index([clerkOrgId])
}
```

### 3. Organization Lifecycle

**When a user creates a Campaign:**

```typescript
const clerkOrg = await clerkClient.organizations.createOrganization({
  name: `${officeName} — ${city}, ${state}`,
  createdBy: user.clerkUserId,
  publicMetadata: { type: 'campaign' },
  privateMetadata: {
    positionId,
    raceId,
    office,
    ballotLevel,
    level,
    state,
    county,
    city,
    district,
    zip,
  },
})

const campaign = await this.model.create({
  data: {
    ...campaignData,
    clerkOrgId: clerkOrg.id,
    positionId,
    raceId,
    office,
    // ... other position fields
  },
})
```

**When a user wins and creates an ElectedOffice ("I won" flow):**

```typescript
const clerkOrg = await clerkClient.organizations.createOrganization({
  name: `${officeName} — ${city}, ${state} (Elected)`,
  createdBy: user.clerkUserId,
  publicMetadata: { type: 'electedOffice' },
  privateMetadata: {
    // Copy position data from campaign
    positionId: campaign.positionId,
    raceId: campaign.raceId,
    // ...
  },
})

const electedOffice = await this.model.create({
  data: {
    ...electedOfficeData,
    clerkOrgId: clerkOrg.id,
    positionId: campaign.positionId,
    // ... copy position fields from campaign
  },
})
```

### 4. Request Scoping (Replaces `@UseSeat()`)

Clerk's middleware puts the active org on `req.auth`. A guard resolves the local Campaign or ElectedOffice:

```typescript
@Injectable()
export class UseClerkOrgGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const { orgId } = request.auth

    if (!orgId) {
      throw new BadRequestException('No active organization')
    }

    const campaign = await this.campaignService.findFirst({
      where: { clerkOrgId: orgId },
    })

    if (campaign) {
      request.campaign = campaign
      request.orgType = 'campaign'
      return true
    }

    const electedOffice = await this.electedOfficeService.findFirst({
      where: { clerkOrgId: orgId },
    })

    if (electedOffice) {
      request.electedOffice = electedOffice
      request.orgType = 'electedOffice'
      return true
    }

    throw new NotFoundException('No campaign or elected office for this organization')
  }
}
```

### 5. Shared Features (Voter File Filters, Contacts)

Shared features scope to `clerkOrgId` instead of a `seatId` FK:

```typescript
// Voter file filter CRUD — uses clerkOrgId from session
const filters = await this.voterFileFilterService.findMany({
  where: { clerkOrgId: req.auth.orgId },
})

// Contacts access check
const campaign = await this.campaignService.findFirst({
  where: { clerkOrgId: req.auth.orgId },
})
const electedOffice = await this.electedOfficeService.findFirst({
  where: { clerkOrgId: req.auth.orgId },
})

const hasAccess = electedOffice || campaign?.isPro
if (!hasAccess) {
  throw new BadRequestException('Pro subscription or elected office required')
}
```

### 6. Product Switcher

Clerk provides this largely out of the box:

```tsx
// Option A: Use Clerk's built-in component
<OrganizationSwitcher />

// Option B: Custom switcher using Clerk hooks
const ProductSwitcher = () => {
  const { organizationList, setActive } = useOrganizationList()

  return (
    <select onChange={e => setActive({ organization: e.target.value })}>
      {organizationList?.map(({ organization }) => (
        <option key={organization.id} value={organization.id}>
          {organization.name}
          {organization.publicMetadata.type === 'campaign' ? ' (Win)' : ' (Serve)'}
        </option>
      ))}
    </select>
  )
}
```

### 7. Future RBAC (Free)

This is where Clerk Organizations shine. When team member access is needed:

- Invite a team member to the Clerk Organization via `organization.inviteMember()`
- Assign roles (`org:admin`, `org:member`, or custom roles like `org:manager`)
- Check permissions in guards via `req.auth.has({ permission: 'org:campaigns:edit' })`
- No `SeatMember` table, no `SeatRole` enum, no invitation email infrastructure

### 8. Migration Plan

#### Phase 1: Clerk Migration + Schema Foundation

1. Complete Clerk auth migration (replace current auth with Clerk)
2. Add `clerkOrgId` column to Campaign, ElectedOffice, VoterFileFilter
3. Add position/geography columns to Campaign and ElectedOffice (extracted from `campaign.details` JSON)
4. Backfill:
   - For each existing Campaign, create a Clerk Organization with `type: campaign` metadata. Set `campaign.clerkOrgId`. Populate position columns from `campaign.details` JSON.
   - For each existing ElectedOffice, create a Clerk Organization with `type: electedOffice` metadata. Set `electedOffice.clerkOrgId`. Copy position data from linked Campaign.
   - For each existing VoterFileFilter, set `clerkOrgId` to the linked Campaign's `clerkOrgId`
5. Set each user's active Clerk Organization to their primary Campaign's org

#### Phase 2: Shared Features Move to clerkOrgId

1. Create `UseClerkOrgGuard` that resolves Campaign or ElectedOffice from `req.auth.orgId`
2. Update VoterFileFilter CRUD to use `clerkOrgId`
3. Update contacts access checks to use `clerkOrgId`
4. Frontend: replace `CampaignProvider`-based switching with Clerk org context

#### Phase 3: ElectedOffice Independence

1. ElectedOffice creation produces its own Clerk Organization
2. `campaignId` on ElectedOffice goes unused for new records
3. Ship product switcher (Clerk's `<OrganizationSwitcher />` or custom)

#### Phase 4: Cleanup

1. Remove `campaignId` from ElectedOffice
2. Remove `campaignId` from VoterFileFilter
3. Remove `electedOffices` relation from Campaign

## What This Gets You Over the Seat Approach

1. **No `SeatMember` or `SeatRole` to build later.** Clerk provides roles, permissions, and invitations for free. This is real future work avoided.
2. **No `x-seat-id` header plumbing.** No custom header, no localStorage persistence, no fetch wrapper, no single-seat fallback logic. Clerk's session token carries the active org automatically.
3. **No `ProductSwitcher` to build from scratch.** Clerk provides `<OrganizationSwitcher />` out of the box, or hooks to build a custom one with minimal code.

## Why We Don't Recommend This

### 1. It doesn't solve the core data modeling problem

The entire motivation for this project is breaking the `ElectedOffice → Campaign` FK. Clerk Organizations operate at the identity/session layer — they have no concept of Prisma FKs, relational integrity, or database schema. You still need to:

- Add position/geography columns somewhere in your DB
- Break the `campaignId` FK on ElectedOffice
- Give VoterFileFilter a new FK target
- Backfill data

The Seat approach solves all of these with a single new table. The pure Clerk approach solves none of them — it just changes how you _identify_ which entity is active.

### 2. Position/geography data gets duplicated with no shared source of truth

The Seat approach puts position data in one place (the Seat table) shared by both Campaign and ElectedOffice. The pure Clerk approach requires duplicating these columns onto **both** Campaign and ElectedOffice, because:

- Clerk metadata is JSON with no type safety, no indexing, and no FK capability
- You can't query Clerk metadata efficiently from your backend
- Position data needs to be in your DB for queries, so it has to go on the local records

When a user holds office and runs for re-election in the same position, the position data exists in three places: Campaign's columns, ElectedOffice's columns, and Clerk org metadata. If any of them drift, there's no authoritative source.

### 3. `clerkOrgId` is a string, not a FK

`VoterFileFilter.clerkOrgId` is a string column pointing to an external system. There's no referential integrity — if a Clerk Organization is deleted, orphaned VoterFileFilter records remain. No cascade deletes. No join queries. Every "find filters for this org" query is a string match against an external ID, not a proper FK relationship.

Compare to the Seat approach where `VoterFileFilter.seatId` is a proper integer FK with cascade delete and indexable joins.

### 4. The guard has to check two tables on every request

The `UseClerkOrgGuard` takes a `clerkOrgId` from the session and has to determine: is this a Campaign or an ElectedOffice? It queries Campaign first, then ElectedOffice if not found. That's two queries per request on the hot path (or a single query with a UNION/polymorphic pattern that gets messy in Prisma).

The Seat approach's `@UseSeat()` guard does one query: look up the Seat by ID. Done. The Seat's `type` field tells you whether it's a campaign or elected office.

### 5. It couples two large migrations

This approach **requires** completing the Clerk auth migration before any of the Win/Serve separation work can begin. Phase 1 of the Seat approach is "pure infrastructure, zero application behavior changes, safe to deploy independently." Phase 1 of this approach is "finish the entire Clerk auth migration, then also backfill Clerk Organizations for every existing Campaign and ElectedOffice."

If the Clerk migration hits delays, the Win/Serve separation is blocked. The Seat approach has no such dependency.

### 6. External service on the critical path

Every authenticated request that needs product context (which is most of them) now depends on Clerk's session containing a valid `orgId`. If Clerk has latency issues or an outage, your org resolution is impacted. The Seat approach reads from your own database — the same database you're already querying for Campaign data anyway.

### 7. Semantic mismatch

Clerk Organizations are designed for B2B multi-tenancy: companies, teams, workspaces. A solo candidate running for city council is not an "organization." For a long time, the vast majority of your Clerk Organizations will have exactly 1 member. This creates ongoing conceptual friction for developers: every piece of Clerk documentation, every example, every mental model assumes organizations with multiple collaborating members.

### 8. Cost

Clerk Organizations are free at small scale (100 Monthly Retained Organizations on the free tier, where an MRO = an org with 2+ members and at least 1 active user). Single-member orgs don't count as MROs, so initially costs are negligible. But once team features launch and orgs start getting multiple members, you'd need the Enhanced B2B Authentication add-on ($100/mo base) with per-org overage pricing ($0.60–$0.90/org/month). This is not a dealbreaker, but it's a real ongoing cost for functionality that the Seat + SeatMember approach provides at no incremental cost.

## Recommendation

The work saved by using Clerk Organizations (the `x-seat-id` header, localStorage switcher, and future `SeatMember` table) is real but small relative to the total project scope. The costs — data duplication, no referential integrity, two-table guard lookups, migration coupling, external dependency — are significant and structural.

**Our recommendation remains: build Seat now, map Clerk Organizations to Seats when RBAC is needed.** Specifically:

1. Ship the Seat model as designed — it solves the immediate decoupling problem cleanly
2. When the Clerk auth migration is complete, create a Clerk Organization per Seat and store `clerkOrgId` on the Seat table
3. Use Clerk's membership/roles/invitations for team access instead of building `SeatMember`
4. Replace the `x-seat-id` header with Clerk's `req.auth.orgId` at that point (a small refactor)

This gets clean data architecture now and Clerk-powered RBAC later, without coupling the two migrations.
