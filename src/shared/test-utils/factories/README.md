# Test Factories

Reusable factory functions for creating test data across unit tests. These factories provide predictable, minimal defaults optimized for testing.

## Quick Start

```typescript
import { userFactory, createProCampaign } from '@/shared/test-utils'
```

## What's Included

### Factories
- `userFactory` - Create test users
- `campaignFactory` - Create test campaigns

### User Helpers
- `createAdminUser()` - User with admin role
- `createCandidateUser()` - User with candidate role (default)
- `createCampaignManagerUser()` - User with campaign manager role

### Campaign Helpers
- `createProCampaign()` - Pro campaign (isPro: true, isVerified: true)
- `createCampaignWithUser(userId)` - Campaign with specific user ID
- `createVerifiedCampaign()` - Verified campaign
- `createDemoCampaign()` - Demo campaign
- `createCampaignWithFreeTexts()` - Campaign with free texts offer
- `createProCampaignWithUser(userId)` - Pro campaign with user (common combo)

### Utilities
- `resetUserCounter()` - Reset user ID counter for test isolation
- `resetCampaignCounter()` - Reset campaign ID counter for test isolation

## Basic Usage

```typescript
import { userFactory, campaignFactory, createProCampaign } from '@/shared/test-utils'

// Create basic entities
const user = userFactory()
const campaign = campaignFactory({ userId: user.id })

// Override specific properties
const admin = userFactory({
  email: 'admin@test.com',
  roles: [UserRole.admin]
})

// Use helper functions
const proCampaign = createProCampaign({ userId: admin.id })
```

## Key Features

✅ **Type-safe** - Full Prisma type support
✅ **Predictable** - Consistent defaults, not random data
✅ **Flexible** - Easy to override any property
✅ **Auto-incrementing IDs** - Unique IDs per test run
✅ **Counter reset** - Test isolation with counter resets

## Files

- `generate.ts` - Factory generator helper
- `userFactory.ts` - User factory and helpers
- `campaignFactory.ts` - Campaign factory and helpers
- `index.ts` - Main exports
- `EXAMPLES.md` - Comprehensive usage examples
- `__tests__/factories.test.ts` - Factory tests

## See Also

- `EXAMPLES.md` - Detailed usage examples and patterns
- `src/shared/test-utils/mockLogger.util.ts` - Mock logger for tests
