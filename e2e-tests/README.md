# E2E API Tests

This directory contains end-to-end API tests using Playwright, migrated from Postman collections.

## Setup

1. Copy `.env.example` to `.env` and configure your environment:

   ```bash
   cp .env.example .env
   ```

2. Update the `.env` file with your test credentials and API URL

3. Install dependencies (if not already installed):
   ```bash
   npm install
   ```

## Directory Structure

```
e2e-tests/
├── playwright.config.ts        # Playwright configuration
├── utils/
│   └── auth.util.ts           # Shared authentication utilities
├── fixtures/
│   ├── test-image.png         # Test image for upload tests
│   └── test-file.txt          # Test file for invalid upload tests
├── tests/
│   ├── health/                # Health check tests
│   │   └── health.spec.ts
│   ├── authentication/        # Authentication tests
│   │   ├── register.spec.ts
│   │   ├── login.spec.ts
│   │   ├── password-reset.spec.ts
│   │   ├── password-update.spec.ts
│   │   ├── set-password.spec.ts
│   │   └── social-login.spec.ts (skipped)
│   └── users/                 # User management tests
│       ├── get-current-user.spec.ts
│       ├── update-current-user.spec.ts
│       ├── user-metadata.spec.ts
│       ├── upload-image.spec.ts
│       └── delete-user.spec.ts
└── postman-old-tests/         # Original Postman collections for reference
```

## Running Tests

Make sure the API server is running before executing tests.

### Run all tests

```bash
npm run test:e2e
```

### Run specific test file

```bash
npm run test:e2e tests/authentication/login.spec.ts
```

### Run specific test folder

```bash
npm run test:e2e tests/authentication/
```

### Run tests in UI mode

```bash
npm run test:e2e:ui
```

### Run tests in debug mode

```bash
npm run test:e2e:debug
```

### View test report

```bash
npm run test:e2e:report
```

## Test Coverage

### Authentication (`/v1/authentication`)

- ✅ **Register** - User registration with validation
- ✅ **Login** - Email/password authentication for candidates and admins
- ✅ **Password Reset** - Recover password via email
- ✅ **Password Update** - Update password for authenticated users
- ✅ **Set Password Email** - Admin/sales sending password set emails
- ⏭️ **Social Login** - OAuth authentication (skipped - requires OAuth setup)

### Users (`/v1/users`)

- ✅ **Get Current User** - Retrieve authenticated user's profile
- ✅ **Update Current User** - Update authenticated user's profile
- ✅ **Get User Metadata** - Retrieve user metadata
- ✅ **Update User Metadata** - Update user metadata with various data types
- ✅ **Upload Image** - Upload user avatar image
- ✅ **Upload Invalid File** - Reject invalid file types
- ✅ **Delete User** - Delete user account with authorization checks

### Health (`/v1/health`)

- ✅ Health check endpoint

## Shared Utilities

### Authentication Utils (`utils/auth.util.ts`)

Common authentication functions:

- `loginUser()` - Login a user and return token
- `registerUser()` - Register a new user
- `deleteUser()` - Clean up test user
- `generateRandomEmail()` - Generate unique test email
- `getBearerToken()` - Format bearer token

Example usage:

```typescript
import { loginUser } from '../../utils/auth.util'

test('my test', async ({ request }) => {
  const { token, user } = await loginUser(
    request,
    'test@example.com',
    'password123',
  )

  const response = await request.get('/v1/protected-endpoint', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
})
```

## Environment Variables

Required in `.env`:

- `API_BASE_URL` - Base URL of the API (e.g., https://gp-api-dev.goodparty.org)
- `CANDIDATE_EMAIL` - Test candidate user email
- `CANDIDATE_PASSWORD` - Test candidate user password
- `CANDIDATE_ID` - Test candidate user ID
- `ADMIN_EMAIL` - Test admin user email
- `ADMIN_PASSWORD` - Test admin user password
- `CAMPAIGN_SLUG` - Test campaign slug
- `GOOGLE_CLIENT_ID` - Google OAuth client ID (for social login tests)

## Writing New Tests

1. Create a new folder matching the NestJS controller structure
2. Create test files for each endpoint
3. Use shared utilities from `utils/` folder
4. Follow the pattern of existing tests

Example:

```typescript
import { test, expect } from '@playwright/test'
import { loginUser } from '../../utils/auth.util'

test.describe('My Feature', () => {
  test('should do something', async ({ request }) => {
    const response = await request.get('/v1/my-endpoint')
    expect(response.status()).toBe(200)
  })
})
```

## Migrating from Postman

Original Postman collections are preserved in `postman-old-tests/` for reference.

When migrating:

1. Create folder structure matching NestJS modules
2. Convert Postman pre-request scripts to test setup
3. Convert Postman tests to Playwright assertions
4. Extract common logic to utility functions
5. Use environment variables from `.env` file

## Configuration

The test configuration is in `playwright.config.ts`:

- Base URL from environment
- Timeout: 30 seconds per test
- Expect timeout: 5 seconds
- Retries: 2 (in CI), 0 (local)
- Workers: 1 (in CI), unlimited (local)
- Reporters: HTML and JSON
