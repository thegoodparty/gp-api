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

## Configuration

The test configuration is in `playwright.config.ts`:

- Base URL from environment
- Timeout: 30 seconds per test
- Expect timeout: 5 seconds
- Retries: 2 (in CI), 0 (local)
- Workers: 1 (in CI), unlimited (local)
- Reporters: HTML and JSON
