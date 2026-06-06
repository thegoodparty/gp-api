import { promises as dns, LookupAddress } from 'node:dns'
import { BadRequestException } from '@nestjs/common'

/**
 * Reject URLs that are unsafe to fetch on the server's behalf because they
 * point at the host's own network (loopback), AWS IMDS (169.254.169.254),
 * RFC1918 internal ranges, or aren't HTTPS.
 *
 * Use BEFORE any server-side fetch of a user-supplied URL. Does not solve
 * DNS-rebinding (a hostname could resolve differently between this check and
 * the subsequent fetch), but covers the vast majority of practical SSRF.
 * For tighter control, route the fetch through a network where private
 * ranges are simply unreachable (most production deploys).
 */
export const assertUrlSafeForExternalFetch = async (
  rawUrl: string,
): Promise<void> => {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new BadRequestException({
      error: 'url_invalid',
      message: 'URL is not a valid absolute URL',
    })
  }

  if (url.protocol !== 'https:') {
    throw new BadRequestException({
      error: 'url_not_https',
      message: 'Only https:// URLs are allowed',
    })
  }

  // dns.lookup returns every A/AAAA the resolver returns for the hostname.
  // We check ALL of them — a hostname that resolves to BOTH a public IP and
  // 169.254.169.254 would otherwise pass a "first IP" check.
  let resolved: LookupAddress[]
  try {
    resolved = await dns.lookup(url.hostname, { all: true })
  } catch {
    throw new BadRequestException({
      error: 'url_unresolvable',
      message: `DNS lookup failed for ${url.hostname}`,
    })
  }

  for (const { address, family } of resolved) {
    if (isPrivateOrLoopbackIp(address, family)) {
      throw new BadRequestException({
        error: 'url_private_address',
        message:
          'URL resolves to a private, loopback, or link-local address; ' +
          'agendas must be hosted on the public internet',
      })
    }
  }
}

const isPrivateOrLoopbackIp = (ip: string, family: number): boolean => {
  if (family === 4) {
    return isPrivateIPv4(ip)
  }
  if (family === 6) {
    return isPrivateIPv6(ip)
  }
  // Unknown family — fail closed.
  return true
}

const isPrivateIPv4 = (ip: string): boolean => {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true
  const a = parts[0]
  const b = parts[1]
  return (
    a === 0 || // "this network" — 0.0.0.0/8
    a === 10 || // RFC1918
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local incl. AWS IMDS
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 168) || // RFC1918
    a >= 224 // multicast + reserved
  )
}

const isPrivateIPv6 = (ip: string): boolean => {
  const lower = ip.toLowerCase()
  if (lower === '::1' || lower === '::') return true
  // Unique-local (fc00::/7) and link-local (fe80::/10)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  if (lower.startsWith('fe80:')) return true
  // IPv4-mapped IPv6 (::ffff:a.b.c.d) — check the embedded v4.
  if (lower.startsWith('::ffff:')) {
    const v4 = lower.slice(7)
    return isPrivateIPv4(v4)
  }
  return false
}
