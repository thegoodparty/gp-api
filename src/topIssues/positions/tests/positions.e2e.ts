import { faker } from '@faker-js/faker'
import { HttpStatus } from '@nestjs/common'
import { expect, test } from '@playwright/test'
import { loginUser } from '../../../../e2e-tests/utils/auth.util'

test.describe('Positions - CRUD Operations', () => {
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

  test('should list positions and extract topIssueId', async ({ request }) => {
    const response = await request.get('/v1/positions', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const positions = (await response.json()) as {
      topIssueId: number
    }[]
    expect(Array.isArray(positions)).toBe(true)

    if (positions.length > 0) {
      expect(positions[0].topIssueId).toBeDefined()
    }
  })

  test('should create a position', async ({ request }) => {
    const listResponse = await request.get('/v1/positions', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const positions = (await listResponse.json()) as {
      topIssueId: number
    }[]
    if (positions.length === 0) {
      test.skip()
      return
    }

    const testTopIssueId = positions[0].topIssueId
    const positionName = faker.lorem.words(3)

    const response = await request.post('/v1/positions', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        name: positionName,
        topIssueId: testTopIssueId,
      },
    })

    expect(response.status()).toBe(HttpStatus.CREATED)

    const position = (await response.json()) as {
      id: number
      name: string
      topIssueId: number
    }
    expect(position.name).toBe(positionName)
    expect(position.topIssueId).toBe(testTopIssueId)

    await request.delete(`/v1/positions/${position.id}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })
  })

  test('should update a position', async ({ request }) => {
    const listResponse = await request.get('/v1/positions', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const positions = (await listResponse.json()) as {
      topIssueId: number
    }[]
    if (positions.length === 0) {
      test.skip()
      return
    }

    const testTopIssueId = positions[0].topIssueId
    const createResponse = await request.post('/v1/positions', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        name: faker.lorem.words(3),
        topIssueId: testTopIssueId,
      },
    })

    const createdPosition = (await createResponse.json()) as { id: number }
    const updatedName = faker.lorem.words(3)

    const updateResponse = await request.put(
      `/v1/positions/${createdPosition.id}`,
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

    const updatedPosition = (await updateResponse.json()) as { name: string }
    expect(updatedPosition.name).toBe(updatedName)

    await request.delete(`/v1/positions/${createdPosition.id}`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })
  })

  test('should delete a position', async ({ request }) => {
    const listResponse = await request.get('/v1/positions', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const positions = (await listResponse.json()) as {
      topIssueId: number
    }[]
    if (positions.length === 0) {
      test.skip()
      return
    }

    const testTopIssueId = positions[0].topIssueId
    const createResponse = await request.post('/v1/positions', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      data: {
        name: faker.lorem.words(3),
        topIssueId: testTopIssueId,
      },
    })

    const createdPosition = (await createResponse.json()) as { id: number }

    const deleteResponse = await request.delete(
      `/v1/positions/${createdPosition.id}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    )

    expect(deleteResponse.status()).toBe(HttpStatus.NO_CONTENT)
  })
})
