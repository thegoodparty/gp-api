import { test, expect } from '@playwright/test'
import { loginUser } from '../../../../e2e-tests/utils/auth.util'
import { CampaignUpdateHistory } from '@prisma/client'

test.describe('Campaigns - Update History', () => {
  const candidateEmail = process.env.CANDIDATE_EMAIL
  const candidatePassword = process.env.CANDIDATE_PASSWORD
  let createdUpdateHistoryId: number

  test.beforeAll(() => {
    test.skip(
      !candidateEmail || !candidatePassword,
      'Candidate credentials not configured',
    )
  })

  test('should get current user update history', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const response = await request.get('/v1/campaigns/mine/update-history', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })

  test('should create update history', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const quantity = Math.floor(Math.random() * 100) + 1

    const response = await request.post('/v1/campaigns/mine/update-history', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      data: {
        type: 'doorKnocking',
        quantity,
      },
    })

    expect(response.status()).toBe(201)

    const body = (await response.json()) as CampaignUpdateHistory
    expect(body.type).toBe('doorKnocking')
    expect(body.quantity).toBe(quantity)
    expect(body.id).toBeTruthy()

    createdUpdateHistoryId = body.id
  })

  test('should delete update history', async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const quantity = Math.floor(Math.random() * 100) + 1
    const createResponse = await request.post(
      '/v1/campaigns/mine/update-history',
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          type: 'doorKnocking',
          quantity,
        },
      },
    )

    const created = (await createResponse.json()) as CampaignUpdateHistory

    const response = await request.delete(
      `/v1/campaigns/mine/update-history/${created.id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(204)
  })

  test('should deny access to other user update history', async ({
    request,
  }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )

    const slugResponse = await request.get('/v1/campaigns/mine/status', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const { slug } = await slugResponse.json()

    const response = await request.get(
      `/v1/campaigns/mine/update-history?slug=${slug}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(403)
  })
})

test.describe('Campaigns - Update History (Admin Access)', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  const candidateEmail = process.env.CANDIDATE_EMAIL
  const candidatePassword = process.env.CANDIDATE_PASSWORD

  test.beforeAll(() => {
    test.skip(
      !adminEmail || !adminPassword || !candidateEmail || !candidatePassword,
      'Admin or candidate credentials not configured',
    )
  })

  test('should allow admin to view other user update history', async ({
    request,
  }) => {
    const candidateLogin = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )
    const slugResponse = await request.get('/v1/campaigns/mine/status', {
      headers: {
        Authorization: `Bearer ${candidateLogin.token}`,
      },
    })
    const { slug } = await slugResponse.json()

    const { token: adminToken } = await loginUser(
      request,
      adminEmail!,
      adminPassword!,
    )

    const response = await request.get(
      `/v1/campaigns/mine/update-history?slug=${slug}`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const body = await response.json()
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })
})
