# E2E Testing Patterns for GP-API

## File Organization

1. **Test file location**: Place test files alongside the feature they test:
   - ✅ Good: `src/authentication/tests/login.e2e.ts`
   - ✅ Good: `src/campaigns/tasks/tests/list-tasks.e2e.ts`
   - ❌ Bad: `e2e-tests/authentication/login.e2e.ts` (centralized location)

2. **Shared utilities**: All shared test utilities go in `e2e-tests/utils/`:
   - `e2e-tests/utils/auth.util.ts` - authentication helpers
   - `e2e-tests/utils/test-context.types.ts` - shared types
   - Additional utility files as needed

3. **Test fixtures**: Place test files and images in `e2e-tests/fixtures/`:
   - `e2e-tests/fixtures/test-image.png`
   - `e2e-tests/fixtures/test-file.txt`

## Test Structure

1. **Import order**:

```typescript
import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import {
  registerUser,
  cleanupTestUser,
  generateRandomEmail,
  // ... other auth utils
} from '../../../e2e-tests/utils/auth.util'
import { TestInfoWithContext } from '../../../e2e-tests/utils/test-context.types'
````

2. **Test describe blocks**: Always use descriptive test.describe():

```typescript
test.describe('Feature - Operation', () => {
  // tests here
})
```

## Test Cleanup Pattern

**CRITICAL**: Always clean up test users to prevent database pollution.

### Pattern 1: Using TestContext (Recommended for tests that create users in beforeEach)

```typescript
test.beforeEach(async ({ request }, testInfo) => {
  const testUserEmail = generateRandomEmail()
  const firstName = generateRandomName()
  const lastName = generateRandomName()

  const result = await registerUser(request, {
    firstName,
    lastName,
    email: testUserEmail,
    password: 'password123',
    phone: '5555555555',
    zip: '12345-1234',
    signUpMode: 'candidate',
  })

  ;(testInfo as TestInfoWithContext).testContext = {
    testUser: {
      userId: result.user.id,
      authToken: result.token,
    },
    testUserEmail,
  }
})

test.afterEach(async ({ request }, testInfo) => {
  const testContext = (testInfo as TestInfoWithContext).testContext

  if (testContext) {
    await cleanupTestUser(request, testContext.testUser)
  }
})
```

### Pattern 2: Using test-scoped variables (For tests that create users per test)

```typescript
test.describe('Feature', () => {
  let testUserId: number | undefined
  let authToken: string | undefined

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
      testUserId = undefined
      authToken = undefined
    }
  })

  test('should do something', async ({ request }) => {
    const registerResponse = await registerUser(request, { ... })
    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    // test logic
  })
})
```

### Pattern 3: Manual cleanup in test (For tests with multiple users)

```typescript
test('should handle multiple users', async ({ request }) => {
  const user1Response = await registerUser(request, { ... })
  const user2Response = await registerUser(request, { ... })

  try {
    // test logic
  } finally {
    await deleteUser(request, user1Response.user.id, user1Response.token)
    await deleteUser(request, user2Response.user.id, user2Response.token)
  }
})
```

## Type Usage

1. **Use Prisma types for database models**:

```typescript
import { Prisma } from '@prisma/client'

type WebsiteWithDomain = Prisma.WebsiteGetPayload<{
  include: {
    domain: true
  }
}>

const website = (await response.json()) as WebsiteWithDomain
```

2. **Use schema output types for API responses**:

```typescript
import { ReadUserOutput } from '../schemas/ReadUserOutput.schema'

const body = (await response.json()) as ReadUserOutput
```

3. **Define response types in auth.util.ts**:

```typescript
export interface LoginResponse {
  token: string
  user: {
    id: number
    email: string
    firstName: string
    lastName: string
    roles: string[]
    hasPassword: boolean
    password?: undefined
  }
}
```

4. **Use feature-specific types from the feature being tested**:

```typescript
import { CampaignTask } from '../campaignTasks.types'

const tasks = (await response.json()) as CampaignTask[]
```

## Fake Data Generation

**Always use Faker** for generating test data via the auth.util helpers:

```typescript
import {
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
} from '../../../e2e-tests/utils/auth.util'

const email = generateRandomEmail() // test-xxxxx@goodparty.org
const firstName = generateRandomName() // realistic first name
const lastName = generateRandomName() // realistic last name
const password = generateRandomPassword() // secure random password
```

For other random data needs:

```typescript
const vanityPath = `test-path-${Date.now()}`
const randomWebsite = `https://${Math.random().toString(36).substring(7)}.com`
```

## HTTP Status Codes

Always use `HttpStatus` enum from `@nestjs/common`:

```typescript
import { HttpStatus } from '@nestjs/common'

expect(response.status()).toBe(HttpStatus.OK) // 200
expect(response.status()).toBe(HttpStatus.CREATED) // 201
expect(response.status()).toBe(HttpStatus.NO_CONTENT) // 204
expect(response.status()).toBe(HttpStatus.BAD_REQUEST) // 400
expect(response.status()).toBe(HttpStatus.UNAUTHORIZED) // 401
expect(response.status()).toBe(HttpStatus.FORBIDDEN) // 403
expect(response.status()).toBe(HttpStatus.NOT_FOUND) // 404
expect(response.status()).toBe(HttpStatus.CONFLICT) // 409
```

## Environment Variables and Test Skipping

Use environment variables for existing test users (candidate, admin):

```typescript
test.describe('Feature requiring existing user', () => {
  const candidateEmail = process.env.CANDIDATE_EMAIL
  const candidatePassword = process.env.CANDIDATE_PASSWORD

  test.beforeAll(() => {
    test.skip(
      !candidateEmail || !candidatePassword,
      'Candidate credentials not configured',
    )
  })

  test('should do something', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )
    // test logic
  })
})
```

Or skip individual tests conditionally:

```typescript
test('should work with data', async ({ request }) => {
  const data = await getTestData(request)

  if (!data || data.length === 0) {
    test.skip()
    return
  }

  // test logic
})
```

## File Uploads

For tests that require file uploads:

```typescript
import * as fs from 'fs'
import * as path from 'path'

const imagePath = path.join(
  __dirname,
  '../../../e2e-tests/fixtures/test-image.png',
)
const imageBuffer = fs.readFileSync(imagePath)

const response = await request.post('/v1/endpoint', {
  headers: {
    Authorization: `Bearer ${authToken}`,
  },
  multipart: {
    file: {
      name: 'test-image.png',
      mimeType: 'image/png',
      buffer: imageBuffer,
    },
    'field[name]': 'value',
  },
})
```

## Authentication Headers

Use consistent Bearer token format:

```typescript
const response = await request.get('/v1/endpoint', {
  headers: {
    Authorization: `Bearer ${authToken}`,
  },
})
```

## Error Response Handling

Check for failure responses with helpful debugging:

```typescript
const response = await request.post('/v1/endpoint', {
  data: { ... },
})

if (!response.ok()) {
  console.log('Request failed:', await response.text())
}
expect(response.status()).toBe(HttpStatus.CREATED)
```

## Assertion Patterns

1. **Basic status checks**:

```typescript
expect(response.status()).toBe(HttpStatus.OK)
expect(response.ok()).toBeTruthy()
```

2. **Response body checks**:

```typescript
const body = await response.json()
expect(body).toHaveProperty('id')
expect(body.email).toBe(testEmail)
expect(body.password).toBeUndefined() // never return passwords
```

3. **Array validations**:

```typescript
const items = (await response.json()) as Item[]
expect(Array.isArray(items)).toBe(true)
expect(items.length).toBeGreaterThan(0)

items.forEach((item) => {
  expect(item).toHaveProperty('id')
  expect(typeof item.name).toBe('string')
})
```

4. **Pattern matching**:

```typescript
expect(body.avatar).toMatch(
  /^https:\/\/assets(-dev|-qa)?\.goodparty\.org\/uploads\/.+\.(png|jpg|jpeg)$/,
)
```

5. **Multiple possible values**:

```typescript
expect([200, 404]).toContain(response.status())
```

## Test Data Isolation

- Each test should be independent and not rely on other tests
- Use `beforeEach` to set up fresh data for each test
- Use `afterEach` to clean up test data
- Don't share mutable state between tests
- Use `test.describe` blocks to group related tests with shared setup/teardown

## Common Pitfalls to Avoid

1. ❌ Don't forget to clean up test users
2. ❌ Don't use hardcoded status codes (use HttpStatus enum)
3. ❌ Don't use hardcoded test data (use faker utilities)
4. ❌ Don't define types inline when they exist in Prisma or schema files
5. ❌ Don't place shared utilities in individual test files
6. ❌ Don't forget to check for environment variables before using them
7. ❌ Don't create centralized test files (keep them near the features they test)

