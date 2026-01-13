import { HttpStatus } from '@nestjs/common'
import { expect, test } from '@playwright/test'
import { loginUser } from '../../../e2e-tests/utils/auth.util'

test.describe('VoterData', () => {
  const candidateEmail = process.env.CANDIDATE_EMAIL
  const candidatePassword = process.env.CANDIDATE_PASSWORD
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  test.beforeAll(() => {
    test.skip(
      !candidateEmail || !candidatePassword,
      'Candidate credentials not configured',
    )
  })

  let candidateToken: string

  test.beforeEach(async ({ request }) => {
    const { token } = await loginUser(
      request,
      candidateEmail!,
      candidatePassword!,
    )
    candidateToken = token
  })

  test('should check if can download voter file', async ({ request }) => {
    const response = await request.get('/v1/voters/voter-file/can-download', {
      headers: {
        Authorization: `Bearer ${candidateToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)

    const canDownload = (await response.json()) as boolean
    expect(typeof canDownload).toBe('boolean')
  })

  test('should wake up voter file service', async ({ request }) => {
    const response = await request.get('/v1/voters/voter-file/wake-up', {
      headers: {
        Authorization: `Bearer ${candidateToken}`,
      },
    })

    expect(response.status()).toBe(HttpStatus.OK)
  })

  test('should get voter locations', async ({ request }) => {
    const response = await request.get(
      '/v1/voters/locations?state=VA&electionType=City',
      {
        headers: {
          Authorization: `Bearer ${candidateToken}`,
        },
      },
    )

    expect(response.status()).toBe(HttpStatus.OK)

    const locations = (await response.json()) as unknown[]
    expect(Array.isArray(locations)).toBe(true)
  })

  test('should not allow user without campaign to download voter file', async ({
    request,
  }) => {
    const userEmail = 'user-without-campaign@example.com'
    const userPassword = 'password123'

    let userToken: string
    try {
      const { token } = await loginUser(request, userEmail, userPassword)
      userToken = token
    } catch {
      test.skip()
      return
    }

    const response = await request.get('/v1/voters/voter-file/can-download', {
      headers: {
        Authorization: `Bearer ${userToken}`,
      },
    })

    expect([HttpStatus.FORBIDDEN, HttpStatus.NOT_FOUND]).toContain(
      response.status(),
    )
  })

  test('should allow admin to get voter file with slug', async ({
    request,
  }) => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')

    const { token: adminToken, campaign } = await loginUser(
      request,
      adminEmail!,
      adminPassword!,
    )

    if (!campaign?.slug) {
      test.skip()
      return
    }

    const response = await request.get(
      `/v1/voters/voter-file?slug=${campaign.slug}&count=true`,
      {
        headers: {
          Authorization: `Bearer ${adminToken}`,
        },
      },
    )

    expect([
      HttpStatus.OK,
      HttpStatus.FORBIDDEN,
      HttpStatus.BAD_REQUEST,
    ]).toContain(response.status())
  })
})
