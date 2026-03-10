# Test Factories - Usage Examples

This document shows how to use the test factories in your unit tests.

## Quick Start

```typescript
import { userFactory, campaignFactory, createProCampaign } from '@/shared/test-utils/factories'
// or
import { userFactory, campaignFactory, createProCampaign } from 'src/shared/test-utils'
```

## User Factory Examples

### Basic User
```typescript
import { userFactory } from '@/shared/test-utils'

const user = userFactory()
// Creates a user with default test values
// { id: 1, email: 'testuser1@goodparty.org', firstName: 'Test', ... }
```

### User with Overrides
```typescript
const user = userFactory({
  email: 'custom@example.com',
  firstName: 'John',
  lastName: 'Doe',
})
```

### Admin User
```typescript
import { createAdminUser } from '@/shared/test-utils'

const admin = createAdminUser()
// User with roles: [UserRole.admin]
```

### Campaign Manager
```typescript
import { createCampaignManagerUser } from '@/shared/test-utils'

const manager = createCampaignManagerUser({
  email: 'manager@goodparty.org'
})
```

## Campaign Factory Examples

### Basic Campaign
```typescript
import { campaignFactory } from '@/shared/test-utils'

const campaign = campaignFactory({ userId: 1 })
// Creates a campaign with default test values
```

### Pro Campaign
```typescript
import { createProCampaign } from '@/shared/test-utils'

const proCampaign = createProCampaign({ userId: 1 })
// Campaign with isPro: true, isVerified: true
```

### Campaign with User
```typescript
import { userFactory, createProCampaignWithUser } from '@/shared/test-utils'

const user = userFactory()
const campaign = createProCampaignWithUser(user.id)
// Pro campaign associated with the user
```

### Campaign with Free Texts Offer
```typescript
import { createCampaignWithFreeTexts } from '@/shared/test-utils'

const campaign = createCampaignWithFreeTexts({
  userId: 1,
  slug: 'my-campaign'
})
// Campaign with hasFreeTextsOffer: true
```

## Real-World Test Example

```typescript
import { Test, TestingModule } from '@nestjs/testing'
import { PrismaClient } from '@prisma/client'
import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest'
import { createMockLogger, userFactory, createProCampaign } from '@/shared/test-utils'
import { PrismaService } from '@/prisma/prisma.service'
import { SomeService } from './some.service'

describe('SomeService', () => {
  let service: SomeService
  let mockPrisma: {
    campaign: {
      findUnique: MockedFunction<PrismaClient['campaign']['findUnique']>
      update: MockedFunction<PrismaClient['campaign']['update']>
    }
  }

  beforeEach(async () => {
    const mockFindUnique = vi.fn()
    const mockUpdate = vi.fn()

    mockPrisma = {
      campaign: {
        findUnique: mockFindUnique,
        update: mockUpdate,
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SomeService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: PinoLogger,
          useValue: createMockLogger(),
        },
      ],
    }).compile()

    service = module.get<SomeService>(SomeService)
  })

  it('should process a pro campaign', async () => {
    // Arrange
    const user = userFactory({ id: 1, email: 'test@example.com' })
    const campaign = createProCampaign({ id: 100, userId: user.id })

    mockPrisma.campaign.findUnique.mockResolvedValue(campaign)

    // Act
    const result = await service.processCampaign(campaign.id)

    // Assert
    expect(result).toBeDefined()
    expect(mockPrisma.campaign.findUnique).toHaveBeenCalledWith({
      where: { id: 100 }
    })
  })

  it('should handle non-pro campaigns differently', async () => {
    // Arrange
    const user = userFactory({ id: 2 })
    const campaign = campaignFactory({
      id: 200,
      userId: user.id,
      isPro: false
    })

    mockPrisma.campaign.findUnique.mockResolvedValue(campaign)

    // Act & Assert
    await expect(service.processCampaign(campaign.id)).rejects.toThrow()
  })
})
```

## Counter Management

The factories use counters to generate unique IDs. You can reset them for test isolation:

```typescript
import { resetUserCounter, resetCampaignCounter } from '@/shared/test-utils'

beforeEach(() => {
  resetUserCounter()
  resetCampaignCounter()
})
```

## Available Helper Functions

### User Helpers
- `userFactory(overrides?)` - Create a basic user
- `createAdminUser(overrides?)` - User with admin role
- `createCandidateUser(overrides?)` - User with candidate role
- `createCampaignManagerUser(overrides?)` - User with campaign manager role
- `resetUserCounter()` - Reset user ID counter

### Campaign Helpers
- `campaignFactory(overrides?)` - Create a basic campaign
- `createProCampaign(overrides?)` - Pro campaign (isPro: true, isVerified: true)
- `createCampaignWithUser(userId, overrides?)` - Campaign with specific user ID
- `createVerifiedCampaign(overrides?)` - Verified campaign
- `createDemoCampaign(overrides?)` - Demo campaign
- `createCampaignWithFreeTexts(overrides?)` - Campaign with free texts offer
- `createProCampaignWithUser(userId, overrides?)` - Pro campaign with specific user
- `resetCampaignCounter()` - Reset campaign ID counter

## Tips

1. **Always override userId**: Campaign factory defaults to userId: 1, make sure to set it appropriately
2. **Use specific helpers**: Prefer `createProCampaign()` over `campaignFactory({ isPro: true })` for readability
3. **Reset counters**: Reset counters in `beforeEach()` for predictable IDs across tests
4. **Type safety**: All factories are fully typed with Prisma types
5. **Minimal data**: These factories create minimal valid entities - override what you need for your test

## Extending the Factories

To add new helper functions, edit the factory files:

- `src/shared/test-utils/factories/userFactory.ts`
- `src/shared/test-utils/factories/campaignFactory.ts`

Then export them in `src/shared/test-utils/factories/index.ts`
