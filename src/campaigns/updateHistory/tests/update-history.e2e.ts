import { test, expect } from '@playwright/test'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  loginUser,
  registerUser,
  RegisterResponse,
} from '../../../../e2e-tests/utils/auth.util'
import { CampaignUpdateHistory } from '@prisma/client'

test.describe('Campaigns - Update History', () => {
  let reg: RegisterResponse

  test.beforeAll(async ({ request }) => {
    reg = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: generateRandomPassword(),
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })
  })

  test.afterAll(async ({ request }) => {
    if (reg?.user?.id && reg?.token) {
      await deleteUser(request, reg.user.id, reg.token)
    }
  })

  test('should get current user update history', async ({ request }) => {
    const response = await request.get('/v1/campaigns/mine/update-history', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })

    expect(response.status()).toBe(200)

    const body = (await response.json()) as Array<
      Record<string, string | number | boolean>
    >
    expect(Array.isArray(body)).toBe(true)
  })

  test('should create update history', async ({ request }) => {
    const quantity = Math.floor(Math.random() * 100) + 1

    const response = await request.post('/v1/campaigns/mine/update-history', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
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
  })

  test('should delete update history', async ({ request }) => {
    const quantity = Math.floor(Math.random() * 100) + 1
    const createResponse = await request.post(
      '/v1/campaigns/mine/update-history',
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
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
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(204)
  })

  test('should deny access to other user update history', async ({
    request,
  }) => {
    const slugResponse = await request.get('/v1/campaigns/mine/status', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })
    const { slug } = (await slugResponse.json()) as { slug: string }

    const response = await request.get(
      `/v1/campaigns/mine/update-history?slug=${slug}`,
      {
        headers: {
          Authorization: `Bearer ${reg.token}`,
        },
      },
    )

    expect(response.status()).toBe(403)
  })
})

test.describe('Campaigns - Update History (Admin Access)', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD
  let candidateReg: RegisterResponse

  test.beforeAll(async ({ request }) => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')

    candidateReg = await registerUser(request, {
      firstName: generateRandomName(),
      lastName: generateRandomName(),
      email: generateRandomEmail(),
      password: generateRandomPassword(),
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    await request.post('/v1/campaigns/mine/update-history', {
      headers: {
        Authorization: `Bearer ${candidateReg.token}`,
      },
      data: {
        type: 'doorKnocking',
        quantity: 5,
      },
    })
  })

  test.afterAll(async ({ request }) => {
    if (candidateReg?.user?.id && candidateReg?.token) {
      await deleteUser(request, candidateReg.user.id, candidateReg.token)
    }
  })

  test('should allow admin to view other user update history', async ({
    request,
  }) => {
    const slugResponse = await request.get('/v1/campaigns/mine/status', {
      headers: {
        Authorization: `Bearer ${candidateReg.token}`,
      },
    })
    const { slug } = (await slugResponse.json()) as { slug: string }

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

    const body = (await response.json()) as Array<
      Record<string, string | number | boolean>
    >
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })
})
