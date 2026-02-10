# Separating Win and Serve: Introducing the Seat Model

**Status:** Draft / RFC
**Author:** [your name]
**Date:** 2026-02-09
**Teams Affected:** Win (Candidates), Serve (Elected Officials)

## Summary

Today, Campaign is the sole organizing entity across the entire GoodParty product. ElectedOffice (the Serve product) is coupled to Campaign via a required FK, meaning an elected official can't exist without a campaign, and a user can't hold an office and run for a different one simultaneously. We propose introducing a **Seat** model — a lightweight shared context representing a user's relationship to a political position — that either a Campaign or an ElectedOffice (but not both) becomes a child of. This decouples the two products while keeping the blast radius small: only the few truly shared features (voter file filters, contacts access) move to Seat, while the vast majority of Campaign and ElectedOffice code stays untouched.

Designs Link: TODO

## Scope

**In Scope**

- New `Seat` model holding position/geography/district data
- Breaking the `ElectedOffice → Campaign` FK dependency
- Moving `VoterFileFilter` to FK to Seat instead of Campaign
- Updating contacts search/download access checks to use Seat
- Frontend product switcher (selecting which Seat to operate in)
- Supporting a user who holds office in one seat and runs for a different one
- Data migration: backfilling Seats from existing Campaign + ElectedOffice records
- Phased rollout plan that delivers value incrementally

**Not In Scope**

- Extracting non-position fields from `campaign.details` JSON
- Changing where `isPro` lives (stays on Campaign)
- Moving PathToVictory off Campaign
- Modifying Win-only features (AI content, website, outreach, ecanvasser, TCR, etc.)
- Modifying Serve-only features (polls, contact engagement)
- Multi-user RBAC / team member access (future work, Seat is designed to support it)
- Touching existing `@UseCampaign()` or `@UseElectedOffice()` decorated routes
- Refactoring `campaign.details` or `campaign.data` JSON blobs
- Changes to payments/Stripe integration
- Changes to CRM/HubSpot sync

## Proposed Solution

### 1. Current State

Campaign is the authorization boundary and data scoping mechanism for the entire API. 16 controllers use `@UseCampaign()`, 80+ services import Campaign, and 15+ tables have a `campaignId` FK. ElectedOffice has a required `campaignId` FK — the schema itself calls this "temporary."

However, the **actual shared surface area** between Win and Serve is small. An audit of every file referencing ElectedOffice reveals only four features that explicitly branch on both products:

| Shared Feature | Location | Current Pattern |
|---|---|---|
| Voter file filter create/update | `voterFile.controller.ts:137,172` | `isPro \|\| hasElectedOffice` |
| Contacts search | `contacts.service.ts:95-101` | `isPro \|\| hasElectedOffice` |
| Contacts download | `contacts.service.ts:230-234` | `isPro \|\| hasElectedOffice` |
| Contacts table (frontend) | `ContactsTableProvider.tsx:163` | `isPro \|\| !!electedOffice` |

Everything else is already clearly one product or the other:
- **Win-only:** P2V, AI content/chat, website, outreach, ecanvasser, TCR, campaign tasks, positions/top issues, plan versions
- **Serve-only:** Polls (`@UseElectedOffice()`), contact engagement (`@UseElectedOffice()`)

### 2. The Seat Model

A **Seat** represents a user's relationship to a specific political position. It holds the position identity, geography, and matched district data that both products need. It is **not** a universal parent that replaces Campaign — it is specifically the shared context for the small set of features used by both Win and Serve.

```
User (1:many)
  └── Seat
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
- A Seat has exactly **one** child: either a Campaign or an ElectedOffice, never both. The `type` enum field enforces this.
- Win-only features FK to **Campaign** (unchanged)
- Serve-only features FK to **ElectedOffice** (unchanged)
- Shared features FK to **Seat**
- `isPro` stays on Campaign; ElectedOffice access is gated by existence of the record
- A User can have multiple Seats (e.g., a `campaign` Seat for a state senate run and an `electedOffice` Seat for a current city council position)
- Re-election scenario: a user who holds office and is running for re-election in the same position has **two Seats** with the same position data — one of type `campaign` and one of type `electedOffice`

### 3. Schema

```prisma
enum SeatType {
  campaign
  electedOffice @map("elected_office")
}

model Seat {
  id        Int      @id @default(autoincrement())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  user   User @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId Int  @map("user_id")

  type SeatType

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

  l2DistrictId        String?  @map("l2_district_id")
  l2DistrictType      String?  @map("l2_district_type")
  l2DistrictName      String?  @map("l2_district_name")
  districtManuallySet Boolean  @default(false) @map("district_manually_set")

  campaign      Campaign?
  electedOffice ElectedOffice?

  voterFileFilters VoterFileFilter[]

  @@index([userId])
  @@map("seat")
}
```

The `type` field determines which child relation is populated. Application-level validation enforces that only the matching child exists (e.g., a Seat with `type = campaign` must have a Campaign and no ElectedOffice).

**Changes to existing models:**

```prisma
model Campaign {
  // All existing fields unchanged

  // NEW
  seat   Seat @relation(fields: [seatId], references: [id], onDelete: Cascade)
  seatId Int  @unique @map("seat_id")

  // REMOVED
  // electedOffices relation (moved to Seat)
}

model ElectedOffice {
  // All existing fields unchanged

  // NEW
  seat   Seat @relation(fields: [seatId], references: [id], onDelete: Cascade)
  seatId Int  @unique @map("seat_id")

  // DEPRECATED (nullable during migration, removed in Phase 4)
  campaignId Int? @map("campaign_id")
}

model VoterFileFilter {
  // All existing filter columns unchanged

  // NEW
  seat   Seat @relation(fields: [seatId], references: [id], onDelete: Cascade)
  seatId Int  @map("seat_id")

  // DEPRECATED (nullable during migration, removed in Phase 4)
  campaignId Int? @map("campaign_id")
}
```

### 4. Phased Implementation

#### Phase 1: Schema + Backfill

**Goal:** Create the Seat table and wire up FK relationships without changing any application behavior.

**Steps:**
1. Create `Seat` table with all position/geography/district columns
2. Add nullable `seatId` column to Campaign, ElectedOffice, and VoterFileFilter
3. Run backfill migration:
   - For each existing Campaign, create a Seat with `type = campaign`, populated from `campaign.details` JSON (office, state, city, county, zip, positionId, raceId, ballotLevel, level, district) and `pathToVictory.data` JSON (districtId → l2DistrictId, electionType → l2DistrictType, electionLocation → l2DistrictName, districtManuallySet). Set `campaign.seatId` to the new Seat.
   - For each existing ElectedOffice, create a **separate** Seat with `type = electedOffice`, copying position/geography data from the linked Campaign's Seat. Set `electedOffice.seatId` to this new Seat. (Each ElectedOffice gets its own Seat, even if it currently shares a Campaign.)
   - For each existing VoterFileFilter, set `voterFileFilter.seatId` to the Campaign's Seat (these are all Win-originated today)
4. Make `seatId` non-nullable on all three tables
5. Add indexes

**Value delivered:** None yet (foundation only). But this is deployable independently with zero application changes.

#### Phase 2: Shared Features Move to Seat

**Goal:** Voter file filters and contacts access use Seat instead of Campaign. ElectedOffice no longer needs Campaign for shared features.

**Steps:**
1. Create `SeatService` with basic CRUD and lookup methods
2. Create `@UseSeat()` guard and `@ReqSeat()` decorator
3. Update VoterFileFilter service to read/write `seatId` instead of `campaignId`
4. Update voter file filter endpoints to use `@UseSeat()`
5. Update contacts search/download access check: instead of `isPro || hasElectedOffice`, check via Seat:

```typescript
// Before (contacts.service.ts)
const electedOffice = await this.electedOfficeService.getCurrentElectedOffice(campaign.userId)
if (!campaign.isPro && !electedOffice) {
  throw new BadRequestException('Campaign is not pro')
}

// After
const seat = request.seat // from @UseSeat() guard
const hasAccess = seat.type === 'electedOffice'
  || (seat.campaign && seat.campaign.isPro)
if (!hasAccess) {
  throw new BadRequestException('Pro subscription or elected office required')
}
```

6. Frontend: update `ContactsTableProvider` to derive `canUseProFeatures` from Seat context

**Value delivered:** Voter file filters are now associated with a Seat. An elected official's voter filters persist independently of any Campaign.

#### Phase 3: ElectedOffice Independence + Product Switcher

**Goal:** An ElectedOffice can be created without a Campaign. Users can hold office and run for a different seat. Frontend product switcher is live.

**Steps:**
1. Make `campaignId` nullable on ElectedOffice (already done in schema, now enforce in application)
2. Update ElectedOffice creation flow to create a Seat directly (no Campaign required)
3. Update poll creation — currently auto-creates an ElectedOffice linked to a Campaign. Instead, auto-creates a Seat and ElectedOffice.
4. Implement product switcher

**Product switcher — server-side:**

The API needs a way to resolve "which Seat is the user operating in." We add a `GET /seats` endpoint and a `x-seat-id` header convention:

```typescript
// GET /seats — returns all seats for the current user
@Get()
@UseGuards(AuthGuard)
async listSeats(@ReqUser() user: User) {
  return this.seatService.findMany({
    where: { userId: user.id },
    include: {
      campaign: { select: { id: true, isActive: true, isPro: true, slug: true } },
      electedOffice: { select: { id: true, isActive: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
}

// @UseSeat() guard — resolves seat from header or falls back to user's sole seat
@Injectable()
export class UseSeatGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const user = request.user
    const seatIdHeader = request.headers['x-seat-id']

    let seat: Seat
    if (seatIdHeader) {
      seat = await this.seatService.findUniqueOrThrow({
        where: { id: Number(seatIdHeader), userId: user.id },
      })
    } else {
      // Backward compat: if user has exactly one seat, use it
      const seats = await this.seatService.findMany({
        where: { userId: user.id },
      })
      if (seats.length === 0) throw new NotFoundException('No seat found')
      if (seats.length === 1) {
        seat = seats[0]
      } else {
        throw new BadRequestException('Multiple seats found; x-seat-id header required')
      }
    }

    request.seat = seat
    return true
  }
}
```

**Product switcher — client-side:**

```tsx
// SeatProvider.tsx
const SeatContext = createContext<SeatContextValue>(...)

const SeatProvider = ({ children }) => {
  const [user] = useUser()
  const [seats, setSeats] = useState<Seat[]>([])
  const [activeSeatId, setActiveSeatId] = useState<number | null>(null)

  useEffect(() => {
    if (!user) return
    clientFetch(apiRoutes.seats.list).then(resp => {
      if (resp.ok) {
        setSeats(resp.data)
        // Default to first seat, or restore from localStorage
        const stored = localStorage.getItem('activeSeatId')
        const defaultId = stored ? Number(stored) : resp.data[0]?.id
        setActiveSeatId(defaultId)
      }
    })
  }, [user])

  const switchSeat = (seatId: number) => {
    setActiveSeatId(seatId)
    localStorage.setItem('activeSeatId', String(seatId))
  }

  const activeSeat = seats.find(s => s.id === activeSeatId) ?? null

  return (
    <SeatContext.Provider value={{ seats, activeSeat, switchSeat }}>
      {children}
    </SeatContext.Provider>
  )
}

// clientFetch wrapper sends x-seat-id header
const fetchWithSeat = (route, options) => {
  const { activeSeat } = useSeat()
  return clientFetch(route, {
    ...options,
    headers: {
      ...options?.headers,
      ...(activeSeat ? { 'x-seat-id': String(activeSeat.id) } : {}),
    },
  })
}

// Product switcher component
const ProductSwitcher = () => {
  const { seats, activeSeat, switchSeat } = useSeat()

  return (
    <select value={activeSeat?.id} onChange={e => switchSeat(Number(e.target.value))}>
      {seats.map(seat => (
        <option key={seat.id} value={seat.id}>
          {seat.office} — {seat.city || seat.county}, {seat.state}
          {seat.type === 'campaign' ? ' (Win)' : ' (Serve)'}
        </option>
      ))}
    </select>
  )
}
```

**Value delivered:** Users can hold office in one Seat (type `electedOffice`) and run for a different position in another Seat (type `campaign`). Product switcher lets users toggle between seats. ElectedOffice is fully independent of Campaign.

#### Phase 4: Cleanup

**Goal:** Remove deprecated columns and dual-read code.

**Steps:**
1. Remove nullable `campaignId` from ElectedOffice
2. Remove nullable `campaignId` from VoterFileFilter
3. Remove `electedOffices` relation from Campaign model
4. Remove any remaining `isPro || hasElectedOffice` checks that weren't migrated to Seat-based checks
5. Drop old indexes on removed columns

#### Future: Multi-User RBAC

When team member access is needed, Seat is the natural anchor point:

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

One membership record per user per Seat. Access to both Campaign and ElectedOffice children flows through the Seat — no need for parallel membership tables.

### 5. What This Avoids Touching

The design is intentionally narrow. The following are **not modified**:

- **`@UseCampaign()` routes (16 controllers):** All Win-only features continue to use `@UseCampaign()`. No changes needed.
- **`@UseElectedOffice()` routes (polls, contact engagement):** All Serve-only features continue to use `@UseElectedOffice()`. No changes needed.
- **`campaign.details` JSON:** Not extracted or restructured. Seat has its own columns; `details` keeps its existing fields. Position data in `details` becomes a read-only copy over time.
- **PathToVictory:** Stays FK'd to Campaign. L2 district data is duplicated to Seat — Seat is the live source of truth, P2V keeps its copy as part of the historical win-number calculation.
- **Payments / Stripe:** `isPro` stays on Campaign. No billing changes.
- **Queue / async jobs:** Continue routing by `campaignId`. No changes.
- **CRM / HubSpot:** Stays campaign-centric. No changes.

## Key Takeaways

- **Seat is small by design.** It holds only position/geography/district data and is the FK target only for the few shared features (voter file filters, contacts access). It is not a universal parent entity.
- **The shared surface area between Win and Serve is only ~4 features.** Most features are already clearly one product or the other. This means the migration blast radius is small.
- **Existing routes don't change.** `@UseCampaign()` and `@UseElectedOffice()` stay as-is. Only the shared features get a new `@UseSeat()` guard.
- **Phase 1 is pure infrastructure** with zero application behavior changes, making it safe to deploy early.
- **ElectedOffice independence is the key unlock.** Once ElectedOffice FKs to its own Seat instead of Campaign, an official can exist without a campaign, and a user can hold one office (Seat type `electedOffice`) while running for a different position (Seat type `campaign`).
- **Multi-user RBAC attaches to Seat later.** One membership table, one invite flow, access to both Campaign and ElectedOffice via the Seat. This avoids building two parallel team systems.
- **`isPro` stays on Campaign.** Serve access is gated by ElectedOffice existence. No billing model changes needed now.

## Open Questions

1. **How do we handle district data updates going forward?** When P2V recalculates or a user manually sets their district, do we write to both Seat and PathToVictory.data? Or does P2V start reading from Seat? Need to define the write path clearly.

2. **What happens to existing ElectedOffice records during Phase 1 backfill?** They currently point to a Campaign. The backfill creates two Seats: one `campaign` Seat for the Campaign, and one `electedOffice` Seat (with copied position data) for the ElectedOffice. This means existing users will immediately have two Seats. Is there any edge case where we'd want to avoid creating the second Seat (e.g., if the ElectedOffice is inactive)?

3. **Should the `x-seat-id` header be required for all authenticated requests, or only for Seat-scoped endpoints?** Requiring it everywhere is simpler but adds friction. Only requiring it for `@UseSeat()` endpoints means most routes don't need to change. Recommendation: only `@UseSeat()` endpoints.

4. **Should outreach move to Seat?** Currently Win-only. If elected officials need outreach capabilities, it could move to Seat in a future phase. Not needed now.

5. **How does the product switcher interact with `GET /campaigns/mine`?** Today the frontend calls this to get "the" campaign. With multiple seats, do we keep this endpoint (returning the campaign for the active seat) or deprecate it in favor of seat-scoped lookups? Recommendation: keep it working for backward compat, add `GET /seats/:id/campaign` for the new flow.

## Alternatives Considered

### A: Seat as Universal Parent

Every feature FKs to Seat. Campaign and ElectedOffice become pure extension tables. PathToVictory, website, outreach, AI content — everything moves to Seat or references `seatId`.

**Why we rejected it:** Requires touching 80+ services, 16 controllers, and 15+ FK relationships. The migration cost is too high for a startup, and the shared surface area doesn't justify it — most features are clearly one product or the other.

### B: Fully Independent Peers (No Shared Entity)

Campaign and ElectedOffice each get their own position/district fields. No Seat model. Shared features accept `campaignId | electedOfficeId` polymorphically.

**Why we rejected it:** Shared features need a polymorphic `campaignId | electedOfficeId` pattern that leaks into service signatures, queue messages, and DB queries. No natural entity for the product switcher or future RBAC. (Note: our approach also duplicates position data when a user has both a Win and Serve Seat for the same position, but Seat provides a single FK target for shared features and a natural anchor for RBAC — the polymorphic approach does not.)

### C: Incremental Duplication (Keep Campaign Coupling)

Keep ElectedOffice's `campaignId` FK. Add `|| hasElectedOffice` branches wherever Serve needs access. Bolt new fields onto ElectedOffice as needed.

**Why we rejected it:** Doesn't solve the core problem — ElectedOffice can't exist without a Campaign. Can't support "hold one office, run for a different one." The `|| hasElectedOffice` pattern already exists in 4 places and would compound. This approach is what created the current coupling in the first place.
