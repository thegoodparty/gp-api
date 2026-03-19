import { test, expect } from '@playwright/test'
import { HttpStatus } from '@nestjs/common'
import { OutreachType } from '@prisma/client'
import {
  deleteUser,
  generateRandomEmail,
  generateRandomName,
  generateRandomPassword,
  registerUser,
  RegisterResponse,
} from '../../../e2e-tests/utils/auth.util'
import { resolveScriptContent } from '../util/resolveScriptContent.util'

interface Outreach {
  id: number
  campaignId: number
  outreachType: OutreachType
  script?: string | null
  status: string
  projectId?: string | null
}

test.describe('Outreach', () => {
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

  test('should fetch outreach campaigns for authenticated user', async ({
    request,
  }) => {
    const response = await request.get('/v1/outreach', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
    })

    expect([HttpStatus.OK, HttpStatus.NOT_FOUND]).toContain(response.status())

    if (response.status() === HttpStatus.OK) {
      const outreaches = (await response.json()) as Outreach[]
      expect(Array.isArray(outreaches)).toBe(true)

      for (const outreach of outreaches) {
        expect(outreach).toHaveProperty('id')
        expect(outreach).toHaveProperty('campaignId')
        expect(outreach).toHaveProperty('outreachType')
        expect(outreach).toHaveProperty('status')
      }
    }
  })

  test('should resolve script key to content from aiContent', () => {
    const aiContent = {
      smsPersuasive: { content: '<p>Vote for me on Election Day!</p>' },
    }

    const resolved = resolveScriptContent('smsPersuasive', aiContent)

    expect(resolved).toBe('Vote for me on Election Day!')
    expect(resolved).not.toBe('smsPersuasive')
  })

  test('should return script as-is when not found in aiContent', () => {
    const aiContent = {}
    const manualScript = 'This is my custom message to voters!'

    const resolved = resolveScriptContent(manualScript, aiContent)

    expect(resolved).toBe(manualScript)
  })
})

test.describe('Outreach - Validation', () => {
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

  test('should reject POST without required fields', async ({ request }) => {
    const response = await request.post('/v1/outreach', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
      data: {},
    })

    expect(response.status()).toBe(HttpStatus.BAD_REQUEST)
  })

  test('should reject P2P outreach without required P2P fields', async ({
    request,
  }) => {
    const response = await request.post('/v1/outreach', {
      headers: {
        Authorization: `Bearer ${reg.token}`,
      },
      data: {
        campaignId: reg.campaign.id,
        outreachType: OutreachType.p2p,
      },
    })

    expect(response.status()).toBe(HttpStatus.BAD_REQUEST)
  })
})
