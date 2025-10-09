import './configrc'
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import axios, { AxiosInstance } from 'axios'
import { execSync } from 'child_process'
import { before, after, beforeEach } from 'node:test'
import { bootstrap } from './app'

export type TestServiceContext = {
  /**
   * A client targeting the test service.
   */
  client: AxiosInstance
}

/**
 * Manages the lifecycle of a PostgreSQL test database container and NestJS application.
 *
 * This utility automatically:
 * - Spins up a PostgreSQL Docker container before all tests
 * - Runs Prisma migrations against the test database
 * - Ensures each test executes against a fresh database (via beforeEach hook)
 * - Spins up the NestJS application
 * - Provides an Axios instance configured to target the test server
 * - Cleans up resources after all tests complete
 *
 * @example
 * ```typescript
 * import { test, describe } from 'node:test'
 * import assert from 'node:assert'
 * import { useTestService } from './test-utils'
 *
 * describe('Posts API', () => {
 *   const service = useTestService()
 *
 *   test('should fetch posts', async () => {
 *     const result = await service.client.get('/v1/posts')
 *     assert.strictEqual(result.status, 200)
 *   })
 * })
 * ```
 */
export const useTestService = (): TestServiceContext => {
  let container: StartedPostgreSqlContainer
  let app: NestFastifyApplication
  let client: AxiosInstance
  let originalDatabaseUrl: string | undefined

  before(async () => {
    // Save original DATABASE_URL
    originalDatabaseUrl = process.env.DATABASE_URL

    // Start PostgreSQL container
    console.log('Starting PostgreSQL container...')
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start()

    // Set DATABASE_URL for Prisma
    const databaseUrl = container.getConnectionUri()
    process.env.DATABASE_URL = databaseUrl

    // Run migrations
    console.log('Running database migrations...')
    execSync('npx prisma migrate deploy', {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    })

    // Create NestJS application using the same bootstrap function as production
    console.log('Starting NestJS application...')
    app = await bootstrap()

    // Start the application on a random available port
    await app.listen({ port: 0, host: '127.0.0.1' })

    // Get the actual port the app is listening on
    const address = app.getHttpServer().address()
    const port = typeof address === 'string' ? 3000 : address.port

    console.log(`Test server listening on port ${port}`)

    // Create Axios client targeting the test server
    client = axios.create({
      baseURL: `http://127.0.0.1:${port}`,
      validateStatus: () => true, // Don't throw on any status code
    })
  })

  beforeEach(async () => {
    // Clean the database before each test to ensure isolation
    // Get PrismaClient instance from the app
    const prisma = app.get('PrismaService')

    // Get all table names from the Prisma schema
    const tableNames = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `

    // Delete all records from each table (except migrations table)
    for (const { tablename } of tableNames) {
      if (tablename !== '_prisma_migrations') {
        await prisma.$executeRawUnsafe(
          `TRUNCATE TABLE "public"."${tablename}" CASCADE;`,
        )
      }
    }
  })

  after(async () => {
    console.log('Cleaning up test resources...')

    // Restore original DATABASE_URL
    if (originalDatabaseUrl !== undefined) {
      process.env.DATABASE_URL = originalDatabaseUrl
    }

    // Close the NestJS application
    if (app) {
      await app.close()
    }

    // Stop the PostgreSQL container
    if (container) {
      await container.stop()
    }
  })

  // Return the context object
  // Note: This object is returned immediately, but the actual values
  // (client, app, etc.) are populated in the before hook
  return {
    get client() {
      if (!client) {
        throw new Error(
          'Test service not initialized. Make sure tests run after before() hook.',
        )
      }
      return client
    },
  }
}
