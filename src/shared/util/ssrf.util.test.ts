import { describe, expect, it, vi } from 'vitest'
import { BadRequestException } from '@nestjs/common'

vi.mock('node:dns', () => ({
  promises: {
    lookup: vi.fn(),
  },
}))

import { promises as dns } from 'node:dns'
import { assertUrlSafeForExternalFetch } from './ssrf.util'

const mockLookup = (records: Array<{ address: string; family: number }>) => {
  // dns.lookup with all:true returns LookupAddress[]
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  vi.mocked(dns.lookup).mockResolvedValue(
    records as unknown as ReturnType<typeof dns.lookup> extends Promise<infer T>
      ? T
      : never,
  )
}

describe('assertUrlSafeForExternalFetch', () => {
  it('rejects invalid URL', async () => {
    await expect(
      assertUrlSafeForExternalFetch('not-a-url'),
    ).rejects.toBeInstanceOf(BadRequestException)
  })

  it('rejects http://', async () => {
    await expect(
      assertUrlSafeForExternalFetch('http://example.com/agenda.pdf'),
    ).rejects.toThrow(/https/)
  })

  it('rejects DNS resolution failure', async () => {
    vi.mocked(dns.lookup).mockRejectedValueOnce(new Error('ENOTFOUND'))
    await expect(
      assertUrlSafeForExternalFetch('https://does-not-exist.invalid/'),
    ).rejects.toThrow(/DNS/)
  })

  it.each([
    ['10.0.0.1', 4, 'RFC1918 10.0.0.0/8'],
    ['172.16.5.10', 4, 'RFC1918 172.16.0.0/12'],
    ['172.31.255.255', 4, 'RFC1918 172.16.0.0/12 upper'],
    ['192.168.1.1', 4, 'RFC1918 192.168.0.0/16'],
    ['127.0.0.1', 4, 'loopback'],
    ['169.254.169.254', 4, 'AWS IMDS link-local'],
    ['0.0.0.0', 4, '0.0.0.0/8'],
    ['224.0.0.1', 4, 'multicast'],
    ['::1', 6, 'IPv6 loopback'],
    ['fc00::1', 6, 'IPv6 ULA'],
    ['fd12:3456::1', 6, 'IPv6 ULA fd-prefix'],
    ['fe80::1', 6, 'IPv6 link-local'],
    ['::ffff:127.0.0.1', 6, 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 6, 'IPv4-mapped IMDS'],
  ])('rejects %s (%s)', async (address, family) => {
    mockLookup([{ address, family }])
    await expect(
      assertUrlSafeForExternalFetch('https://victim.example/file.pdf'),
    ).rejects.toThrow(/private|loopback|link-local/)
  })

  it('rejects when any resolved IP is private even if first is public', async () => {
    mockLookup([
      { address: '93.184.216.34', family: 4 },
      { address: '169.254.169.254', family: 4 },
    ])
    await expect(
      assertUrlSafeForExternalFetch('https://rebind.example/file.pdf'),
    ).rejects.toThrow(/private|loopback|link-local/)
  })

  it('accepts a public IPv4 address', async () => {
    mockLookup([{ address: '93.184.216.34', family: 4 }])
    await expect(
      assertUrlSafeForExternalFetch('https://example.com/agenda.pdf'),
    ).resolves.toBeUndefined()
  })

  it('accepts a public IPv6 address', async () => {
    mockLookup([{ address: '2606:2800:220:1:248:1893:25c8:1946', family: 6 }])
    await expect(
      assertUrlSafeForExternalFetch('https://example.com/agenda.pdf'),
    ).resolves.toBeUndefined()
  })
})
