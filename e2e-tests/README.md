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
│   ├── users/                 # User management tests
│   │   ├── get-current-user.spec.ts
│   │   ├── update-current-user.spec.ts
│   │   ├── user-metadata.spec.ts
│   │   ├── upload-image.spec.ts
│   │   └── delete-user.spec.ts
│   ├── campaigns/             # Campaign tests
│   │   ├── map/               # Campaign map tests
│   │   │   ├── get-map.spec.ts
│   │   │   └── get-map-count.spec.ts
│   │   ├── update-history/    # Update history tests
│   │   │   └── update-history.spec.ts
│   │   ├── tasks/             # Campaign tasks tests
│   │   │   ├── list-tasks.spec.ts
│   │   │   └── complete-tasks.spec.ts
│   │   ├── base/              # Base campaign operations
│   │   │   ├── list-campaigns.spec.ts
│   │   │   └── user-campaigns.spec.ts
│   │   ├── race-target-details/  # Race target details tests
│   │   │   └── race-target-details.spec.ts
│   │   ├── tcr-compliance/    # TCR compliance tests
│   │   │   └── tcr-compliance.spec.ts
│   │   └── mass-updates/      # Mass update tests
│   │       └── mass-updates.spec.ts
│   ├── websites/              # Candidate website tests
│   │   ├── website-crud.spec.ts
│   │   ├── website-vanity-path.spec.ts
│   │   ├── website-contacts.spec.ts
│   │   ├── website-views.spec.ts
│   │   └── domains.spec.ts
│   └── cmsContent/            # CMS content tests
│       ├── aiContent.spec.ts
│       ├── articleTags.spec.ts
│       ├── blogArticles.spec.ts
│       ├── blogSections.spec.ts
│       ├── faqArticles.spec.ts
│       ├── general.spec.ts
│       ├── glossaryItems.spec.ts
│       ├── staticContent.spec.ts
│       └── sync.spec.ts
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

### Campaigns (`/v1/campaigns`)

#### Map (`/v1/campaigns/map`)

- ✅ **Get Map** - Retrieve campaigns map with filters (results, party, level, office)
- ✅ **Get Map Count** - Get campaigns count with filters (results, state)

#### Update History (`/v1/campaigns/mine/update-history`)

- ✅ **Get Update History** - Retrieve current user's update history
- ✅ **Create Update History** - Create new update history entry
- ✅ **Delete Update History** - Delete update history entry
- ✅ **Access Control** - Deny/allow access to other users' update history

#### Tasks (`/v1/campaigns/tasks`)

- ✅ **List All Tasks** - List all campaign tasks across all weeks
- ✅ **List Tasks by Week** - Filter tasks by specific weeks (1-8)
- ✅ **Complete Task** - Mark task as completed
- ✅ **Uncomplete Task** - Mark task as not completed

#### Base Operations

- ✅ **List Campaigns** - Admin list all campaigns with various filters
- ✅ **Get Campaign by Slug** - Retrieve campaign by slug
- ✅ **Get User Campaign** - Get logged-in user's campaign
- ✅ **Get Campaign Status** - Get user campaign status
- ✅ **Get Plan Version** - Get campaign plan version
- ✅ **Create Campaign** - Create new campaign for user
- ✅ **Update Campaign** - Update campaign data and details
- ✅ **Set Campaign Office** - Set campaign office details
- ✅ **Launch Campaign** - Launch a campaign
- ✅ **Admin Update by Slug** - Admin update campaign by slug

#### Race Target Details (`/v1/campaigns/mine/race-target-details`)

- ✅ **Update Race Target Details** - Update race target details for current user
- ✅ **Manually Set L2District** - Set district manually
- ✅ **Admin Update by Slug** - Admin update race target details by slug
- ✅ **Admin with excludeTurnout** - Admin update with includeTurnout flag
- ✅ **Access Control** - Deny unauthorized access to admin endpoints

#### TCR Compliance (`/v1/campaigns/tcr-compliance`)

- ✅ **Create TCR Compliance** - Create new TCR compliance record
- ✅ **Duplicate Conflict** - Reject duplicate TCR compliance
- ✅ **Validation** - Reject invalid matching contact fields
- ✅ **Check Status** - Check TCR compliance status
- ✅ **Submit PIN** - Submit campaign verify PIN
- ✅ **Delete** - Delete TCR compliance record

#### Mass Updates

- ✅ **Missing Win Numbers** - Admin mass update missing win numbers
- ✅ **Mass Hubspot Push** - Admin mass refresh companies
- ✅ **Authorization** - Deny unauthorized access to mass update endpoints

### Websites (`/v1/websites`)

#### CRUD Operations

- ✅ **Create Website** - Create candidate website
- ✅ **Get My Website** - Retrieve authenticated user's website
- ✅ **Update Website** - Update website content with text fields
- ✅ **Update Website Images** - Upload logo and hero images
- ✅ **Merge Content** - Merge updates with existing website content
- ✅ **Authorization** - Deny unauthorized access to website operations

#### Vanity Path

- ✅ **Validate Vanity Path** - Check if vanity path is available
- ✅ **Detect Conflict** - Detect vanity path conflicts
- ✅ **View Published Website** - View published website by vanity path
- ✅ **Preview Website** - Preview website content (authenticated)
- ✅ **Access Control** - Deny access to unpublished websites

#### Contacts

- ✅ **Submit Contact Form** - Submit contact form on published website
- ✅ **Get Website Contacts** - Retrieve website contacts with pagination
- ✅ **Pagination** - Test contact pagination and filtering
- ✅ **Access Control** - Deny contact form on unpublished websites

#### Views

- ✅ **Track Website View** - Track website view with visitor ID
- ✅ **Multiple Visitors** - Track multiple views from different visitors
- ✅ **Get Views by Date Range** - Retrieve views within date range
- ✅ **Filter Views** - Test date range filtering
- ✅ **Authorization** - Deny unauthorized access to view analytics

#### Domains

- ✅ **Search Domain** - Search for domain availability and pricing
- ✅ **Domain Suggestions** - Retrieve alternative domain suggestions
- ✅ **Get Website by Domain** - Retrieve website by domain name
- ⚠️ **Domain Registration** - Skipped (actual purchase would cost money)
- ⚠️ **Domain Configuration** - Skipped (requires actual domain)

### CMS Content (`/v1/content`)

- ✅ **Blog Articles** - Fetch and filter blog articles
- ✅ **Blog Sections** - Retrieve blog sections
- ✅ **FAQ Articles** - Fetch FAQ articles
- ✅ **Glossary Items** - Retrieve glossary items
- ✅ **Static Content** - Fetch static content
- ✅ **AI Content** - Retrieve AI-generated content
- ✅ **Article Tags** - Fetch article tags
- ✅ **Sync Content** - Sync content from external sources

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
