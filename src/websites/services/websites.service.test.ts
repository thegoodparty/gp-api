import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { WebsitesService } from './websites.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}))

const mockedAxiosGet = vi.mocked(axios.get)

const buildHtml = ({
  candidateName = 'Jane Doe',
  includePrivacyPolicy = true,
  includeTerms = true,
  includeIdentity = true,
} = {}): string => `
  <html>
    <body>
      <h1>${includeIdentity ? candidateName : 'Anonymous Campaign'} for Senate</h1>
      <p>Vote for change.</p>
      ${includePrivacyPolicy ? '<a href="/privacy">Privacy Policy</a>' : ''}
      ${includeTerms ? '<a href="/terms">Terms of Service</a>' : ''}
    </body>
  </html>
`

describe('WebsitesService.verifyLive', () => {
  let service: WebsitesService
  let mockPrisma: {
    website: { findUnique: ReturnType<typeof vi.fn> }
  }

  beforeEach(async () => {
    mockPrisma = {
      website: {
        findUnique: vi.fn().mockResolvedValue({
          id: 1,
          domain: { name: 'vote-jane.com' },
          campaign: {
            user: { firstName: 'Jane', lastName: 'Doe' },
          },
        }),
      },
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebsitesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: PinoLogger, useValue: createMockLogger() },
      ],
    }).compile()

    service = module.get<WebsitesService>(WebsitesService)
    vi.clearAllMocks()
  })

  it('returns verified=true when HTTP 200 + all required sections + identity present', async () => {
    mockedAxiosGet.mockResolvedValue({ status: 200, data: buildHtml() })

    const result = await service.verifyLive(1)

    expect(mockedAxiosGet).toHaveBeenCalledWith(
      'https://vote-jane.com/',
      expect.objectContaining({ validateStatus: expect.any(Function) }),
    )
    expect(result).toEqual({
      verified: true,
      url: 'https://vote-jane.com/',
      checks: {
        http_200: true,
        has_privacy_policy: true,
        has_terms: true,
        has_candidate_identity: true,
      },
    })
  })

  it('returns verified=false with has_privacy_policy=false when the privacy section is missing', async () => {
    mockedAxiosGet.mockResolvedValue({
      status: 200,
      data: buildHtml({ includePrivacyPolicy: false }),
    })

    const result = await service.verifyLive(1)

    expect(result.verified).toBe(false)
    expect(result.checks).toEqual({
      http_200: true,
      has_privacy_policy: false,
      has_terms: true,
      has_candidate_identity: true,
    })
  })

  it('returns verified=false with http_200=false when the URL responds 404', async () => {
    mockedAxiosGet.mockResolvedValue({ status: 404, data: 'Not Found' })

    const result = await service.verifyLive(1)

    expect(result.verified).toBe(false)
    expect(result.checks.http_200).toBe(false)
    expect(result.checks.has_privacy_policy).toBe(false)
    expect(result.checks.has_terms).toBe(false)
    expect(result.checks.has_candidate_identity).toBe(false)
  })

  it('returns verified=false with has_candidate_identity=false when the page does not name the candidate', async () => {
    mockedAxiosGet.mockResolvedValue({
      status: 200,
      data: buildHtml({ includeIdentity: false }),
    })

    const result = await service.verifyLive(1)

    expect(result.verified).toBe(false)
    expect(result.checks.has_candidate_identity).toBe(false)
  })

  it('does not retry on network failure — single shot, returns http_200=false', async () => {
    mockedAxiosGet.mockRejectedValue(new Error('ECONNREFUSED'))

    const result = await service.verifyLive(1)

    expect(mockedAxiosGet).toHaveBeenCalledTimes(1)
    expect(result.verified).toBe(false)
    expect(result.checks.http_200).toBe(false)
  })

  it('throws BadRequestException when no domain is attached', async () => {
    mockPrisma.website.findUnique.mockResolvedValue({
      id: 1,
      domain: null,
      campaign: { user: { firstName: 'Jane', lastName: 'Doe' } },
    })

    await expect(service.verifyLive(1)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(mockedAxiosGet).not.toHaveBeenCalled()
  })

  it('throws NotFoundException when no website exists for the campaign', async () => {
    mockPrisma.website.findUnique.mockResolvedValue(null)

    await expect(service.verifyLive(1)).rejects.toBeInstanceOf(
      NotFoundException,
    )
    expect(mockedAxiosGet).not.toHaveBeenCalled()
  })
})
