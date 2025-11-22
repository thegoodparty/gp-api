import { test, expect } from '@playwright/test'
import {
  registerUser,
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
} from '../../../e2e-tests/utils/auth.util'
import * as fs from 'fs'
import * as path from 'path'
import { Prisma } from '@prisma/client'

type WebsiteWithDomain = Prisma.WebsiteGetPayload<{
  include: {
    domain: true
  }
}>

test.describe('Websites - CRUD Operations', () => {
  let testUserId: number | undefined
  let authToken: string | undefined

  test.afterEach(async ({ request }) => {
    if (testUserId && authToken) {
      await deleteUser(request, testUserId, authToken)
      testUserId = undefined
      authToken = undefined
    }
  })

  test('should create a website', async ({ request }) => {
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse = await registerUser(request, {
      firstName,
      lastName,
      email,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    const response = await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(201)

    const website = (await response.json()) as WebsiteWithDomain
    expect(website.status).toBe('unpublished')
    expect(website.campaignId).toBe(registerResponse.campaign.id)
  })

  test('should get my website', async ({ request }) => {
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse = await registerUser(request, {
      firstName,
      lastName,
      email,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const response = await request.get('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    expect(response.status()).toBe(200)

    const website = (await response.json()) as WebsiteWithDomain
    expect(website.campaignId).toBe(registerResponse.campaign.id)
    expect(website).toHaveProperty('id')
    expect(website).toHaveProperty('status')
    expect(website).toHaveProperty('content')
  })

  test('should update website with text fields', async ({ request }) => {
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse = await registerUser(request, {
      firstName,
      lastName,
      email,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const mainTitle = 'Test Campaign Title'
    const issueTitle = 'Healthcare Reform'
    const issueDescription = 'Affordable healthcare for all citizens'
    const contactEmail = 'contact@test.com'
    const vanityPath = `test-path-${Date.now()}`

    const updateResponse = await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        'main[title]': mainTitle,
        'about[issues][0][title]': issueTitle,
        'about[issues][0][description]': issueDescription,
        'contact[email]': contactEmail,
        vanityPath: vanityPath,
        status: 'published',
      },
    })

    expect(updateResponse.status()).toBe(200)

    const updatedWebsite =
      (await updateResponse.json()) as WebsiteWithDomain & {
        content: {
          main?: { title?: string; tagline?: string; image?: string }
          logo?: string
          about?: { issues?: Array<{ title: string; description: string }> }
          contact?: { email?: string }
        }
      }

    expect(updatedWebsite.content.main?.title).toBe(mainTitle)
    expect(updatedWebsite.content.about?.issues?.[0]?.title).toBe(issueTitle)
    expect(updatedWebsite.content.about?.issues?.[0]?.description).toBe(
      issueDescription,
    )
    expect(updatedWebsite.content.contact?.email).toBe(contactEmail)
    expect(updatedWebsite.vanityPath).toBe(vanityPath)
    expect(updatedWebsite.status).toBe('published')
  })

  test('should update website with image uploads', async ({ request }) => {
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse = await registerUser(request, {
      firstName,
      lastName,
      email,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    const imagePath = path.join(
      __dirname,
      '../../../e2e-tests/fixtures/test-image.png',
    )
    const imageBuffer = fs.readFileSync(imagePath)

    const updateResponse = await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        logoFile: {
          name: 'logo.png',
          mimeType: 'image/png',
          buffer: imageBuffer,
        },
        heroFile: {
          name: 'hero.png',
          mimeType: 'image/png',
          buffer: imageBuffer,
        },
        'main[title]': 'Test Title',
      },
    })

    expect(updateResponse.status()).toBe(200)

    const updatedWebsite =
      (await updateResponse.json()) as WebsiteWithDomain & {
        content: {
          logo?: string
          main?: { image?: string }
        }
      }

    expect(updatedWebsite.content.logo).toBeTruthy()
    expect(updatedWebsite.content.logo).toMatch(
      /^https:\/\/assets(-dev|-qa)?\.goodparty\.org\/uploads\/.+\.(png|jpg|jpeg)$/,
    )
    expect(updatedWebsite.content.main?.image).toBeTruthy()
    expect(updatedWebsite.content.main?.image).toMatch(
      /^https:\/\/assets(-dev|-qa)?\.goodparty\.org\/uploads\/.+\.(png|jpg|jpeg)$/,
    )
  })

  test('should update website and merge with existing content', async ({
    request,
  }) => {
    const email = generateRandomEmail()
    const firstName = generateRandomName()
    const lastName = generateRandomName()
    const password = generateRandomPassword()

    const registerResponse = await registerUser(request, {
      firstName,
      lastName,
      email,
      password,
      phone: '5555555555',
      zip: '12345-1234',
      signUpMode: 'candidate',
    })

    testUserId = registerResponse.user.id
    authToken = registerResponse.token

    await request.post('/v1/websites', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    })

    await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        'main[title]': 'Original Title',
        'main[tagline]': 'Original Tagline',
      },
    })

    const updateResponse = await request.put('/v1/websites/mine', {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      multipart: {
        'main[title]': 'Updated Title',
      },
    })

    expect(updateResponse.status()).toBe(200)

    const updatedWebsite =
      (await updateResponse.json()) as WebsiteWithDomain & {
        content: {
          main?: { title?: string; tagline?: string }
        }
      }

    expect(updatedWebsite.content.main?.title).toBe('Updated Title')
    expect(updatedWebsite.content.main?.tagline).toBe('Original Tagline')
  })

  test('should return 401 when not authenticated', async ({ request }) => {
    const response = await request.get('/v1/websites/mine')

    expect(response.status()).toBe(401)
  })
})
