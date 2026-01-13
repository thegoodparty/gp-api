import { faker } from '@faker-js/faker'
import { HttpStatus } from '@nestjs/common'
import { expect, test } from '@playwright/test'
import { loginUser } from '../../../e2e-tests/utils/auth.util'

test.describe('TopIssues - CRUD Operations', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  test.beforeAll(() => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')
  })

  let authToken: string

  test.beforeEach(async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)
    authToken = token
  })

  test('should list top issues', async ({ request }) => {
    const response = await request.get('/v1/top-issues', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)
    expect(response.headers()['content-type']).toContain('application/json')

    const topIssues = (await response.json()) as unknown[]
    expect(Array.isArray(topIssues)).toBe(true)
  })

  test('should get top issues by location', async ({ request }) => {
    const response = await request.get('/v1/top-issues/by-location?zip=30030', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const issues = (await response.json()) as string[]
    expect(Array.isArray(issues)).toBe(true)
    if (issues.length > 0) {
      expect(typeof issues[0]).toBe('string')
    }
  })

  test('should create a top issue', async ({ request }) => {
    const issueName = faker.word.words(2)

    const response = await request.post('/v1/top-issues', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        name: issueName,
      },
    })

    expect(response.status()).toBe(HttpStatus.CREATED)

    const issue = (await response.json()) as { id: number }
    expect(issue).toHaveProperty('id')
  })

  test('should fail to create duplicate top issue', async ({ request }) => {
    const issueName = 'Duplicate Issue Test'

    const firstResponse = await request.post('/v1/top-issues', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        name: issueName,
      },
    })

    expect(firstResponse.status()).toBe(HttpStatus.CREATED)
    const issue = (await firstResponse.json()) as { id: number }

    const duplicateResponse = await request.post('/v1/top-issues', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        name: issueName,
      },
    })

    expect(duplicateResponse.status()).toBe(HttpStatus.CONFLICT)

    await request.delete(`/v1/top-issues/${issue.id}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })
  })

  test('should update a top issue', async ({ request }) => {
    const createResponse = await request.post('/v1/top-issues', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        name: faker.word.words(2),
      },
    })

    const createdIssue = (await createResponse.json()) as { id: number }
    const updatedName = 'Updated Issue Name'

    const updateResponse = await request.put(
      `/v1/top-issues/${createdIssue.id}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
        data: {
          name: updatedName,
        },
      },
    )

    expect(updateResponse.status()).toBe(HttpStatus.OK)

    const updatedIssue = (await updateResponse.json()) as { name: string }
    expect(updatedIssue.name).toBe(updatedName)

    await request.delete(`/v1/top-issues/${createdIssue.id}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })
  })

  test('should delete a top issue', async ({ request }) => {
    const createResponse = await request.post('/v1/top-issues', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        name: faker.word.words(2),
      },
    })

    const createdIssue = (await createResponse.json()) as { id: number }

    const deleteResponse = await request.delete(
      `/v1/top-issues/${createdIssue.id}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    )

    expect(deleteResponse.status()).toBe(HttpStatus.NO_CONTENT)
  })
})
