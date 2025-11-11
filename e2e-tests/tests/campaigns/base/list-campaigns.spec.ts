import { test, expect } from '@playwright/test'
import { loginUser } from '../../../utils/auth.util'

test.describe('Campaigns - List Campaigns (Admin)', () => {
  const adminEmail = process.env.ADMIN_EMAIL
  const adminPassword = process.env.ADMIN_PASSWORD

  test.beforeAll(() => {
    test.skip(!adminEmail || !adminPassword, 'Admin credentials not configured')
  })

  test('should get all campaigns without filters', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const response = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(Array.isArray(campaigns)).toBe(true)
    expect(campaigns.length).toBeGreaterThan(0)

    const campaign = campaigns[0]
    expect(campaign).toHaveProperty('id')
    expect(campaign).toHaveProperty('slug')
    expect(campaign).toHaveProperty('data')
    expect(campaign).toHaveProperty('details')
    expect(campaign).toHaveProperty('user')
    expect(campaign).toHaveProperty('pathToVictory')
  })

  test('should filter campaigns by id', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const testCampaign = allCampaigns.find((campaign: any) => campaign?.id)

    if (!testCampaign) {
      test.skip()
      return
    }

    const response = await request.get(`/v1/campaigns?id=${testCampaign.id}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0].id).toBe(testCampaign.id)
  })

  test('should filter campaigns by state', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const testState = allCampaigns[3]?.details?.state?.toLowerCase()

    if (!testState) {
      test.skip()
      return
    }

    const response = await request.get(`/v1/campaigns?state=${testState}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns.length).toBeGreaterThan(0)
    campaigns.forEach((campaign: any) => {
      expect(campaign.details.state?.toLowerCase()).toBe(testState)
    })
  })

  test('should filter campaigns by email', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const campaignWithEmail = allCampaigns.find((c: any) => c.user?.email)
    const testEmail = campaignWithEmail?.user?.email

    if (!testEmail) {
      test.skip()
      return
    }

    const response = await request.get(`/v1/campaigns?email=${testEmail}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns.length).toBeGreaterThan(0)
    campaigns.forEach((campaign: any) => {
      expect(campaign.user.email?.toLowerCase()).toBe(testEmail.toLowerCase())
    })
  })

  test('should filter campaigns by slug', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const testSlug = allCampaigns[2]?.slug?.toLowerCase()

    if (!testSlug) {
      test.skip()
      return
    }

    const response = await request.get(`/v1/campaigns?slug=${testSlug}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns).toHaveLength(1)
    expect(campaigns[0].slug?.toLowerCase()).toBe(testSlug)
  })

  test('should filter campaigns by level', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const testLevel = allCampaigns[5]?.details?.ballotLevel?.toUpperCase()

    if (!testLevel) {
      test.skip()
      return
    }

    const response = await request.get(`/v1/campaigns?level=${testLevel}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns.length).toBeGreaterThan(0)
    campaigns.forEach((campaign: any) => {
      expect(campaign.details.ballotLevel?.toLowerCase()).toBe(
        testLevel.toLowerCase(),
      )
    })
  })

  test('should filter campaigns by p2vStatus', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const testP2vStatus = allCampaigns[6]?.pathToVictory?.data?.p2vStatus

    if (!testP2vStatus) {
      test.skip()
      return
    }

    const response = await request.get(
      `/v1/campaigns?p2vStatus=${testP2vStatus}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns.length).toBeGreaterThan(0)
    campaigns.forEach((campaign: any) => {
      expect(campaign.pathToVictory?.data?.p2vStatus?.toLowerCase()).toBe(
        testP2vStatus.toLowerCase(),
      )
    })
  })

  test('should filter campaigns by campaignStatus', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const response = await request.get('/v1/campaigns?campaignStatus=active', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns.length).toBeGreaterThan(0)
    campaigns.forEach((campaign: any) => {
      expect(campaign.isActive).toBe(true)
    })
  })

  test('should filter campaigns by primary election date start', async ({
    request,
  }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const testDate = allCampaigns[0]?.details?.electionDate

    if (!testDate) {
      test.skip()
      return
    }

    const response = await request.get(
      `/v1/campaigns?primaryElectionDateStart=${testDate}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns.length).toBeGreaterThanOrEqual(0)
    const dateFilter = new Date(testDate)
    campaigns.forEach((campaign: any) => {
      if (campaign.details.primaryElectionDate) {
        expect(new Date(campaign.details.primaryElectionDate).getTime()).toBeGreaterThanOrEqual(dateFilter.getTime())
      }
    })
  })

  test('should filter campaigns by general election date start', async ({
    request,
  }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const testDate = allCampaigns[0]?.details?.electionDate

    if (!testDate) {
      test.skip()
      return
    }

    const response = await request.get(
      `/v1/campaigns?generalElectionDateStart=${testDate}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns.length).toBeGreaterThan(0)
    const dateFilter = new Date(testDate)
    campaigns.forEach((campaign: any) => {
      expect(new Date(campaign.details.electionDate).getTime()).toBeGreaterThanOrEqual(dateFilter.getTime())
    })
  })

  test('should filter campaigns by primary election date end', async ({
    request,
  }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const testDate = allCampaigns[0]?.details?.electionDate

    if (!testDate) {
      test.skip()
      return
    }

    const response = await request.get(
      `/v1/campaigns?primaryElectionDateEnd=${testDate}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns.length).toBeGreaterThan(0)
    const dateFilter = new Date(testDate)
    campaigns.forEach((campaign: any) => {
      if (campaign.details.primaryElectionDate) {
        expect(new Date(campaign.details.primaryElectionDate).getTime()).toBeLessThanOrEqual(dateFilter.getTime())
      }
    })
  })

  test('should filter campaigns by general election date end', async ({
    request,
  }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const testDate = allCampaigns[0]?.details?.electionDate

    if (!testDate) {
      test.skip()
      return
    }

    const response = await request.get(
      `/v1/campaigns?generalElectionDateEnd=${testDate}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    )

    expect(response.status()).toBe(200)

    const campaigns = await response.json()
    expect(campaigns.length).toBeGreaterThan(0)
    const dateFilter = new Date(testDate)
    campaigns.forEach((campaign: any) => {
      expect(new Date(campaign.details.electionDate).getTime()).toBeLessThanOrEqual(dateFilter.getTime())
    })
  })

  test('should get campaign by slug', async ({ request }) => {
    const { token } = await loginUser(request, adminEmail!, adminPassword!)

    const allCampaignsResponse = await request.get('/v1/campaigns', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const allCampaigns = await allCampaignsResponse.json()
    const testSlug = allCampaigns[2]?.slug?.toLowerCase()

    if (!testSlug) {
      test.skip()
      return
    }

    const response = await request.get(`/v1/campaigns/slug/${testSlug}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    expect(response.status()).toBe(200)

    const campaign = await response.json()
    expect(campaign.slug?.toLowerCase()).toBe(testSlug)
    expect(campaign).toHaveProperty('id')
    expect(campaign).toHaveProperty('data')
    expect(campaign).toHaveProperty('details')
    expect(campaign).toHaveProperty('pathToVictory')
  })
})

