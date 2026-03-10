# Migration Example: Using Shared Test Factories

This document shows a real example of migrating from local mock functions to shared test factories.

## File: `peerlyIdentity.service.test.ts`

### Before (Local Mock Functions)

```typescript
function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    email: 'candidate@example.com',
    phone: '+15551234567',
    firstName: 'Jane',
    lastName: 'Doe',
    name: 'Jane Doe',
    createdAt: new Date(),
    updatedAt: new Date(),
    metaData: null,
    avatar: null,
    zip: '62701',
    password: null,
    hasPassword: false,
    roles: [],
    passwordResetToken: null,
    ...overrides,
  }
}

function createMockCampaign(
  overrides: Omit<Partial<Campaign>, 'details'> & {
    details?: PrismaJson.CampaignDetails
  } = {},
): Campaign {
  const { details, ...rest } = overrides
  const campaign: Campaign = {
    id: 1,
    organizationSlug: null,
    slug: 'test-campaign',
    isVerified: false,
    isActive: true,
    isPro: false,
    isDemo: false,
    didWin: null,
    dateVerified: null,
    tier: null,
    formattedAddress: '123 Main St, Springfield, IL 62701',
    details: {
      electionDate: '2024-11-05',
      ballotLevel: BallotReadyPositionLevel.FEDERAL,
      ...details,
    },
    placeId: 'test-place-id',
    aiContent: {},
    data: {},
    vendorTsData: {},
    userId: 1,
    canDownloadFederal: false,
    completedTaskIds: [],
    hasFreeTextsOffer: false,
    freeTextsOfferRedeemedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
  }
  return campaign
}
```

**Issues:**
- 45+ lines of duplicated code
- Needs to be maintained separately in each test file
- Inconsistent defaults across test files
- No type safety for complex nested objects

### After (Shared Factories)

```typescript
import { createMockLogger, userFactory, campaignFactory } from '@/shared/test-utils'

/**
 * Create a mock user for peerly identity tests
 * Uses the shared userFactory with peerly-specific defaults
 */
function createMockUser(overrides: Partial<User> = {}): User {
  return userFactory({
    id: 1,
    email: 'candidate@example.com',
    phone: '+15551234567',
    firstName: 'Jane',
    lastName: 'Doe',
    name: 'Jane Doe',
    zip: '62701',
    password: null,
    hasPassword: false,
    roles: [],
    ...overrides,
  })
}

/**
 * Create a mock campaign for peerly identity tests
 * Uses the shared campaignFactory with peerly-specific defaults
 */
function createMockCampaign(
  overrides: Omit<Partial<Campaign>, 'details'> & {
    details?: PrismaJson.CampaignDetails
  } = {},
): Campaign {
  const { details, ...rest } = overrides
  return campaignFactory({
    id: 1,
    slug: 'test-campaign',
    formattedAddress: '123 Main St, Springfield, IL 62701',
    placeId: 'test-place-id',
    details: {
      electionDate: '2024-11-05',
      ballotLevel: BallotReadyPositionLevel.FEDERAL,
      ...details,
    },
    userId: 1,
    ...rest,
  })
}
```

**Benefits:**
- Reduced from 75+ lines to ~30 lines
- Leverages shared, well-tested factory functions
- Consistent defaults come from shared factories
- Only override what's specific to peerly tests
- All tests pass without changes ✅

## Alternative: Direct Usage

For even simpler tests, you can use the factories directly without wrapper functions:

```typescript
import { userFactory, campaignFactory } from '@/shared/test-utils'

describe('MyService', () => {
  it('should process a user', () => {
    const user = userFactory({
      email: 'test@example.com',
      phone: '+15551234567',
    })

    // test logic here
  })

  it('should process a campaign', () => {
    const campaign = campaignFactory({
      formattedAddress: '123 Main St',
      details: {
        electionDate: '2024-11-05',
      },
    })

    // test logic here
  })
})
```

## Results

✅ **All 15 tests passing** after migration
✅ **Reduced code duplication** across test files
✅ **Easier maintenance** - update factories once, all tests benefit
✅ **Better consistency** - shared defaults across all tests

## Next Steps

Look for other test files with similar patterns:
1. Search for `function createMock` in test files
2. Identify duplicated user/campaign creation logic
3. Refactor to use shared factories
4. Consider adding new factory helpers for common patterns
