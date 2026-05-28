import { Test, TestingModule } from '@nestjs/testing'
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import * as dns from 'node:dns'
import {
  WebsitesService,
  isPublicAddress,
  ssrfSafeLookup,
} from './websites.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

vi.mock('axios', () => ({
  default: { get: vi.fn() },
}))

vi.mock('node:dns', async (orig) => {
  const real = await orig<typeof import('node:dns')>()
  return { ...real, default: real, lookup: vi.fn() }
})

const mockedAxiosGet = vi.mocked(axios.get)
const mockedDnsLookup = vi.mocked(dns.lookup)

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  result: dns.LookupAddress[],
) => void

const stubDnsLookup = (addresses: dns.LookupAddress[] | Error) => {
  mockedDnsLookup.mockImplementation(
    (
      _hostname: string,
      optionsOrCallback: unknown,
      maybeCallback?: unknown,
    ) => {
      const cb = (
        typeof optionsOrCallback === 'function'
          ? optionsOrCallback
          : maybeCallback
      ) as LookupCallback
      if (addresses instanceof Error) {
        cb(addresses as NodeJS.ErrnoException, [])
      } else {
        cb(null, addresses)
      }
    },
  )
}

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
    stubDnsLookup([{ address: '93.184.216.34', family: 4 }])
  })

  it('short-circuits to verified=true without fetching when OTEL_SERVICE_ENVIRONMENT=dev', async () => {
    const original = process.env.OTEL_SERVICE_ENVIRONMENT
    process.env.OTEL_SERVICE_ENVIRONMENT = 'dev'
    try {
      const result = await service.verifyLive(1)
      expect(mockedAxiosGet).not.toHaveBeenCalled()
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
    } finally {
      if (original === undefined) delete process.env.OTEL_SERVICE_ENVIRONMENT
      else process.env.OTEL_SERVICE_ENVIRONMENT = original
    }
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

  it('throws BadRequestException without fetching when domain resolves to a private IPv4 (10.x.x.x)', async () => {
    stubDnsLookup([{ address: '10.0.0.1', family: 4 }])

    await expect(service.verifyLive(1)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(mockedAxiosGet).not.toHaveBeenCalled()
  })

  it('throws BadRequestException when domain resolves to the AWS metadata IP (169.254.169.254)', async () => {
    stubDnsLookup([{ address: '169.254.169.254', family: 4 }])

    await expect(service.verifyLive(1)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(mockedAxiosGet).not.toHaveBeenCalled()
  })

  it('throws BadRequestException when domain resolves to loopback (127.0.0.1)', async () => {
    stubDnsLookup([{ address: '127.0.0.1', family: 4 }])

    await expect(service.verifyLive(1)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(mockedAxiosGet).not.toHaveBeenCalled()
  })

  it('throws BadRequestException when any resolved address is private (mixed v4 + v6)', async () => {
    stubDnsLookup([
      { address: '93.184.216.34', family: 4 },
      { address: 'fe80::1', family: 6 },
    ])

    await expect(service.verifyLive(1)).rejects.toBeInstanceOf(
      BadRequestException,
    )
    expect(mockedAxiosGet).not.toHaveBeenCalled()
  })

  it('proceeds to fetch when domain resolves to a public unicast address', async () => {
    stubDnsLookup([{ address: '93.184.216.34', family: 4 }])
    mockedAxiosGet.mockResolvedValue({ status: 200, data: buildHtml() })

    const result = await service.verifyLive(1)

    expect(mockedAxiosGet).toHaveBeenCalledTimes(1)
    expect(result.verified).toBe(true)
  })

  it('proceeds (and the fetch naturally fails) when DNS lookup fails — does not pre-emptively block', async () => {
    stubDnsLookup(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))
    mockedAxiosGet.mockRejectedValue(new Error('ENOTFOUND'))

    const result = await service.verifyLive(1)

    expect(result.verified).toBe(false)
    expect(result.checks.http_200).toBe(false)
  })
})

describe('isPublicAddress', () => {
  it.each([
    '10.0.0.1',
    '10.255.255.254',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.1',
    '127.0.0.1',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '255.255.255.255',
    '224.0.0.1',
    '::1',
    'fe80::1',
    'fc00::1',
    '::',
    '::ffff:10.0.0.1',
  ])('rejects %s as non-public', (ip) => {
    expect(isPublicAddress(ip)).toBe(false)
  })

  it.each([
    '8.8.8.8',
    '1.1.1.1',
    '93.184.216.34',
    '2001:4860:4860::8888',
    '2606:4700:4700::1111',
  ])('accepts %s as public unicast', (ip) => {
    expect(isPublicAddress(ip)).toBe(true)
  })

  it('rejects garbage input', () => {
    expect(isPublicAddress('not-an-ip')).toBe(false)
    expect(isPublicAddress('')).toBe(false)
  })
})

describe('ssrfSafeLookup (connection-time defense)', () => {
  const invoke = (
    hostname = 'example.com',
  ): Promise<{
    err: NodeJS.ErrnoException | null
    address: string
    family: number
  }> =>
    new Promise((resolve) => {
      ssrfSafeLookup(hostname, {}, (err, address, family) =>
        resolve({
          err,
          address: typeof address === 'string' ? address : '',
          family: family ?? 0,
        }),
      )
    })

  beforeEach(() => {
    mockedDnsLookup.mockReset()
  })

  it('passes the address through when DNS resolves to a single public unicast IP', async () => {
    stubDnsLookup([{ address: '93.184.216.34', family: 4 }])

    const { err, address, family } = await invoke()

    expect(err).toBeNull()
    expect(address).toBe('93.184.216.34')
    expect(family).toBe(4)
  })

  it('propagates the dns.lookup error to the callback', async () => {
    stubDnsLookup(Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' }))

    const { err, address, family } = await invoke()

    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toBe('ENOTFOUND')
    expect(address).toBe('')
    expect(family).toBe(0)
  })

  it('rejects when any resolved address is non-public (single private result)', async () => {
    stubDnsLookup([{ address: '10.0.0.1', family: 4 }])

    const { err, address } = await invoke('attacker.example.com')

    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toMatch(/non-public IP 10\.0\.0\.1/)
    expect(address).toBe('')
  })

  it('rejects when any resolved address is non-public (mixed v4 public + v6 link-local)', async () => {
    stubDnsLookup([
      { address: '93.184.216.34', family: 4 },
      { address: 'fe80::1', family: 6 },
    ])

    const { err } = await invoke()

    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toMatch(/non-public IP fe80::1/)
  })

  it('rejects with a clear error when dns.lookup returns an empty array', async () => {
    stubDnsLookup([])

    const { err, address, family } = await invoke('empty.example.com')

    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toMatch(/No addresses resolved/)
    expect(address).toBe('')
    expect(family).toBe(0)
  })

  it('rejects the AWS metadata IP (169.254.169.254)', async () => {
    stubDnsLookup([{ address: '169.254.169.254', family: 4 }])

    const { err } = await invoke()

    expect(err).toBeInstanceOf(Error)
    expect(err?.message).toMatch(/169\.254\.169\.254/)
  })
})
