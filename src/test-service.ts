import './configrc'
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql'
import { NestFastifyApplication } from '@nestjs/platform-fastify'
import axios, { AxiosInstance } from 'axios'
import { beforeEach, beforeAll, afterAll } from 'vitest'
import { bootstrap } from './app'
import { PrismaService } from './prisma/prisma.service'
import { randomBytes } from 'crypto'
import { Client } from 'pg'
import { readFileSync } from 'fs'
import { sync as glob } from 'fast-glob'
import jwt from 'jsonwebtoken'
import { User } from '@prisma/client'

export type TestServiceContext = {
  /** A client targeting the test service. */
  client: AxiosInstance

  /** The NestJS application instance. */
  app: NestFastifyApplication

  /** The user currently logged in to the test service. */
  user: User

  /** A Prisma client instance. */
  prisma: PrismaService
}

/**
 * Provides an abstraction for testing the NestJS API via a test harness. Provides an
 * Axios client that can be used to make requests to the test service, which is backed
 * by a "real" Postgres database in Docker.
 *
 * @example
 * ```typescript
 * import { expect, test } from 'vitest'
 * import { useTestService } from './test-service'
 *
 * const service = useTestService()
 *
 * test('should fetch posts', async () => {
 *   const result = await service.client.get('/v1/posts')
 *   expect(result.status).toBe(200)
 * })
 * ```
 */
export const useTestService = (): TestServiceContext => {
  let container: StartedPostgreSqlContainer
  let app: NestFastifyApplication
  let client: AxiosInstance
  let user: User

  beforeAll(async () => {
    // Generate unique database name for this test suite. It's important to use unique
    // database names per suite to ensure that suites are isolated from each other.
    const uniqueDbName = `test_db_${randomBytes(8).toString('hex')}`

    // Start PostgreSQL container
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('postgres') // Connect to default postgres database initially
      .withUsername('test_user')
      .withPassword('test_password')
      .withReuse()
      .start()

    const baseConnectionUri = container.getConnectionUri()

    const runQuery = async (connectionString: string, query: string) => {
      const pgClient = new Client({ connectionString })
      await pgClient.connect()
      await pgClient.query(query)
      await pgClient.end()
    }

    // Create the unique database.
    await runQuery(
      container.getConnectionUri(),
      `CREATE DATABASE ${uniqueDbName}`,
    )

    const databaseUrl = baseConnectionUri.replace(
      '/postgres',
      `/${uniqueDbName}`,
    )
    // Run the migrations
    await runQuery(
      databaseUrl,
      glob(`${__dirname}/../prisma/schema/migrations/*/*.sql`)
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n'),
    )
    // Set DATABASE_URL for Prisma with the unique database
    process.env.DATABASE_URL = databaseUrl

    // Create NestJS application using the same bootstrap function as production
    app = await bootstrap({ loggingEnabled: false })

    // Start the application on a random available port
    await app.listen({ port: 0, host: '127.0.0.1' })

    // Get the actual port the app is listening on
    const address = app.getHttpServer().address()
    const port =
      typeof address === 'string'
        ? 3000
        : // @ts-expect-error - address is not well-ttyped
          address.port

    // Create Axios client targeting the test server
    client = axios.create({
      baseURL: `http://127.0.0.1:${port}`,
      // We should frequently be testing for non-200 status codes. So, disable
      // automatic throwing on status codes, in favor of using explicit assertions
      // for success/failure in the test code.
      validateStatus: () => true,
    })

    // Add a user authentication token to every request
    client.interceptors.request.use((config) => {
      if (!config.headers.Authorization) {
        const authToken = jwt.sign(
          { sub: user.id, email: user.email },
          process.env.AUTH_SECRET!,
          { expiresIn: '1h' },
        )
        config.headers.Authorization = `Bearer ${authToken}`
      }
      return config
    })
  }, 25_000)

  beforeEach(async () => {
    const prisma = app.get(PrismaService)

    // Get all table names from the Prisma schema
    const tableNames = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables WHERE schemaname='public'
    `

    // Empty every table before each test run to isolate individual tests
    // within a suite. Truncate all tables in a single statement for better performance.
    if (tableNames.length > 0) {
      const tableList = tableNames
        .map(({ tablename }) => `"public"."${tablename}"`)
        .join(', ')
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${tableList} CASCADE;`,
      )
    }

    // Create a test user for the current test
    user = await prisma.user.create({
      data: {
        id: 123,
        email: 'tests@goodparty.org',
        firstName: 'Johnny',
        lastName: 'Goodparty',
      },
    })
  })

  afterAll(async () => {
    // Close the NestJS application
    if (app) {
      await app.close()
    }
  })

  // Return the context object
  // Note: This object is returned immediately, but the actual values
  // (client, app, etc.) are populated in the before hook
  return {
    get client() {
      return client
    },

    get app() {
      return app
    },

    get user() {
      return user
    },

    get prisma() {
      return app.get(PrismaService)
    },
  }
}
