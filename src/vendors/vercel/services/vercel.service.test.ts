import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VercelService } from './vercel.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

describe('VercelService', () => {
  let service: VercelService
  const fetchMock =
    vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    service = new VercelService(createMockLogger())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws before fetch when the input URL host is not vercel.com', async () => {
    await expect(
      service.submitDomainRegistrantVerification(
        'https://attacker.example/verify',
      ),
    ).rejects.toThrow('Refusing to submit non-vercel.com verification URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws before fetch when the input URL is not https', async () => {
    await expect(
      service.submitDomainRegistrantVerification('http://vercel.com/verify'),
    ).rejects.toThrow('Refusing to submit non-vercel.com verification URL')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws when a redirect location points off vercel.com', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 302,
      headers: {
        get: (name: string) =>
          name === 'location' ? 'https://attacker.example/landing' : null,
      } as Headers,
    } as Response)

    await expect(
      service.submitDomainRegistrantVerification(
        'https://vercel.com/verify-domain?token=t',
      ),
    ).rejects.toThrow('Refusing redirected registrant verification URL')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('throws when Vercel returns a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 404 }))

    await expect(
      service.submitDomainRegistrantVerification(
        'https://vercel.com/verify-domain?token=t',
      ),
    ).rejects.toThrow('Vercel returned 404 for registrant verification URL')
  })

  it('returns status for a successful verification request', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }))

    await expect(
      service.submitDomainRegistrantVerification(
        'https://vercel.com/verify-domain?token=t',
      ),
    ).resolves.toEqual({ status: 200 })
  })
})
