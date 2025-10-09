# Integration Testing Guide

This directory contains integration tests for the NestJS API using a real PostgreSQL database running in Docker.

## Overview

The `useTestService()` utility in `src/test-utils.ts` provides a complete test harness that:

- **Automatically manages a PostgreSQL Docker container** - Spins up and tears down a containerized database
- **Runs database migrations** - Applies all Prisma migrations before tests run
- **Ensures test isolation** - Each test gets a fresh, clean database via `beforeEach()` hooks
- **Bootstraps the full NestJS application** - Tests run against the real application code
- **Provides an HTTP client** - Pre-configured Axios instance for making API requests

## Prerequisites

- Docker must be installed and running
- Node.js 22.12.0 or higher
- All dependencies installed (`npm install --legacy-peer-deps`)

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run a specific test file
npm test -- src/health/health.spec.ts
```

## Writing Tests

### Basic Example

```typescript
import { test, describe } from 'node:test'
import assert from 'node:assert'
import { useTestService } from '../test-utils'

describe('My API Tests', () => {
  const service = useTestService()

  test('should fetch data', async () => {
    const response = await service.client.get('/v1/my-endpoint')

    assert.strictEqual(response.status, 200)
    assert.ok(response.data)
  })
})
```

### Testing with Database State

```typescript
test('should create and fetch a user', async () => {
  // Create a user
  const createRes = await service.client.post('/v1/users', {
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
  })

  assert.strictEqual(createRes.status, 201)
  const userId = createRes.data.id

  // Fetch the user
  const fetchRes = await service.client.get(`/v1/users/${userId}`)
  assert.strictEqual(fetchRes.data.email, 'test@example.com')
})
```

### Test Isolation

Each test runs with a completely fresh database:

```typescript
test('test 1 - creates a user', async () => {
  await service.client.post('/v1/users', { email: 'test@example.com' })
  // User exists in database
})

test('test 2 - database is clean', async () => {
  // The user from test 1 does NOT exist here
  // Database was truncated by beforeEach() hook
  await service.client.post('/v1/users', { email: 'test@example.com' })
  // This works because the database is clean
})
```

## Test Structure

The `useTestService()` function uses Node.js native test hooks:

- **`before()`** - Runs once before all tests
  - Starts PostgreSQL container
  - Runs Prisma migrations
  - Bootstraps NestJS application
  - Creates HTTP client

- **`beforeEach()`** - Runs before each test
  - Truncates all database tables (except migrations)
  - Ensures each test has a clean slate

- **`after()`** - Runs once after all tests
  - Closes NestJS application
  - Stops PostgreSQL container
  - Cleans up resources

## HTTP Client

The `service.client` is an Axios instance configured with:

- **Base URL**: Points to the running test server (random port)
- **Validation**: Won't throw on any status code - you can test error responses
- **Global prefix**: All requests are prefixed with `/v1` (matches production)

Example usage:

```typescript
// GET request
const res = await service.client.get('/v1/users')

// POST request with body
const res = await service.client.post('/v1/users', {
  email: 'test@example.com'
})

// Test error responses (won't throw)
const res = await service.client.get('/v1/nonexistent')
assert.strictEqual(res.status, 404)
```

## Best Practices

1. **Keep tests independent** - Don't rely on state from other tests
2. **Use descriptive test names** - Make it clear what you're testing
3. **Test happy and error paths** - Don't just test success cases
4. **Clean up resources** - The harness does this automatically
5. **Use assertions liberally** - Verify all important aspects of responses

## Troubleshooting

### Docker Issues

If tests fail to start:
- Ensure Docker is running
- Check Docker has permission to pull images
- Try `docker pull postgres:16-alpine` manually

### Port Conflicts

The test server uses a random available port, so conflicts are unlikely. If you see port errors:
- Check no other test runs are active
- Ensure cleanup completed from previous test run

### Migration Errors

If migrations fail:
- Ensure your Prisma schema is valid
- Check DATABASE_URL is set correctly
- Try running `npx prisma migrate dev` locally first

## Examples

See these files for working examples:
- `src/health/health.spec.ts` - Simple health check test
- `src/__tests__/example-integration.spec.ts` - Comprehensive examples
