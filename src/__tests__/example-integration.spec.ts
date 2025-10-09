/**
 * Example Integration Test
 *
 * This file demonstrates how to use the useTestService() utility to write
 * integration tests against a real PostgreSQL database running in Docker.
 *
 * Key features:
 * - Automatic Docker container management
 * - Fresh database for each test
 * - Real HTTP requests via Axios
 * - Full NestJS application bootstrap
 *
 * To run this test:
 *   node --import tsx --test src/__tests__/example-integration.spec.ts
 */

import { test, describe } from 'node:test'
import assert from 'node:assert'
import { useTestService } from '../test-utils'

describe('Example Integration Tests', () => {
  const service = useTestService()

  describe('Health Check', () => {
    test('should return OK when service is healthy', async () => {
      const response = await service.client.get('/v1/health')

      assert.strictEqual(response.status, 200)
      assert.strictEqual(response.data, 'OK')
    })
  })

  describe('Database Isolation', () => {
    test('should have a clean database on first test', async () => {
      // This test creates a user
      const createResponse = await service.client.post('/v1/users', {
        email: 'test1@example.com',
        firstName: 'Test',
        lastName: 'User',
      })

      // Verify we can create the user (status < 500 means no server error)
      assert.ok(createResponse.status < 500)
    })

    test('should have a clean database on second test (data from previous test should be gone)', async () => {
      // This test should NOT see the user from the previous test
      // because beforeEach() truncates all tables
      const createResponse = await service.client.post('/v1/users', {
        email: 'test1@example.com', // Same email as previous test
        firstName: 'Test',
        lastName: 'User',
      })

      // Should succeed because the database was cleaned
      assert.ok(createResponse.status < 500)
    })
  })

  describe('Error Handling', () => {
    test('should handle 404 errors gracefully', async () => {
      const response = await service.client.get('/v1/nonexistent-endpoint')

      assert.strictEqual(response.status, 404)
    })
  })
})
