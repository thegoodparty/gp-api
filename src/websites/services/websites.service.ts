import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { Prisma, User } from '../../generated/prisma'
import axios from 'axios'
import * as dns from 'node:dns'
import { promisify } from 'node:util'
import * as http from 'node:http'
import * as https from 'node:https'
import ipaddr from 'ipaddr.js'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { getUserFullName } from 'src/users/util/users.util'
import { VerifyLiveResponse } from '../schemas/VerifyLive.schema'

const dnsLookup = promisify(dns.lookup)

type PositionWithTopIssue = Prisma.CampaignPositionGetPayload<{
  include: { topIssue: true }
}>

@Injectable()
export class WebsitesService extends createPrismaBase(MODELS.Website) {
  createByCampaign(user: User, campaign: CampaignWith<'campaignPositions'>) {
    const campaignPositions =
      // Prisma include query — TypeScript cannot narrow the included relations at compile time
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      campaign.campaignPositions as PositionWithTopIssue[]
    const issues = campaignPositions.map((position, index) => ({
      title: position.topIssue?.name ?? `Issue ${index + 1}`,
      description: position.description ?? `Issue ${index + 1} description`,
    }))

    // NOTE: this is in a WIP state, better default content generation TBD
    // TODO: generate AI content here for any missing fields
    return this.model.create({
      data: {
        campaignId: campaign.id,
        vanityPath: campaign.slug,
        content: {
          theme: 'light',
          main: {
            title: `Vote For ${getUserFullName(user)}`,
            tagline: 'Local Solutions, Not Party Politics',
          },
          about: {
            issues,
          },
          contact: {
            email: user.email,
            phone: user.phone ?? undefined,
          },
        },
      },
    })
  }

  update(args: Prisma.WebsiteUpdateArgs) {
    return this.model.update(args)
  }

  async findByDomainName(domainName: string, include?: Prisma.WebsiteInclude) {
    const domainRecord = await this.client.domain.findUniqueOrThrow({
      where: { name: domainName },
      include: {
        website: {
          include,
        },
      },
    })

    return domainRecord.website
  }

  async getWebsiteIdByDomain(domainName: string) {
    const { websiteId } = await this.client.domain.findUniqueOrThrow({
      where: { name: domainName },
    })
    return websiteId
  }

  async verifyLive(campaignId: number): Promise<VerifyLiveResponse> {
    const website = await this.client.website.findUnique({
      where: { campaignId },
      include: {
        domain: true,
        campaign: {
          select: {
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    })

    if (!website) {
      throw new NotFoundException('No website found for this campaign')
    }
    if (!website.domain) {
      throw new BadRequestException(
        'verify-live requires an attached domain. Purchase a domain first.',
      )
    }

    const url = `https://${website.domain.name}/`

    // On dev, the candidate's vanity site isn't actually attached to the dev
    // Vercel project — the domain DNS resolves to a generic GP placeholder
    // page that lacks the privacy/terms/identity markers verify-live looks for.
    // Short-circuit so the rest of the compliance flow (TCR submission) is
    // testable in dev.
    if (process.env.OTEL_SERVICE_ENVIRONMENT !== 'prod') {
      return {
        verified: true,
        url,
        checks: {
          http_200: true,
          has_privacy_policy: true,
          has_terms: true,
          has_candidate_identity: true,
        },
      }
    }

    await assertPublicHostname(website.domain.name)
    const html = await fetchLiveHtml(url)
    const user = website.campaign?.user
    const candidateName = user
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
      : null

    return scoreLiveHtml(url, html, candidateName)
  }
}

type LiveFetchResult = { status: number; body: string | null }

export const isPublicAddress = (address: string): boolean => {
  if (ipaddr.IPv6.isValid(address)) {
    const v6 = ipaddr.IPv6.parse(address)
    return v6.isIPv4MappedAddress()
      ? v6.toIPv4Address().range() === 'unicast'
      : v6.range() === 'unicast'
  }
  if (ipaddr.IPv4.isValid(address)) {
    return ipaddr.IPv4.parse(address).range() === 'unicast'
  }
  return false
}

export const assertPublicHostname = async (hostname: string): Promise<void> => {
  const addresses = await dnsLookup(hostname, { all: true }).catch(
    () => [] as dns.LookupAddress[],
  )
  if (addresses.length === 0) {
    return
  }
  const offending = addresses.find(({ address }) => !isPublicAddress(address))
  if (offending) {
    throw new BadRequestException(
      `${hostname} resolves to a non-public IP address (${offending.address})`,
    )
  }
}

export const ssrfSafeLookup: NonNullable<https.AgentOptions['lookup']> = (
  hostname,
  options,
  callback,
) => {
  const opts = typeof options === 'number' ? { family: options } : options || {}
  dns.lookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) {
      return callback(err, '', 0)
    }
    if (addresses.length === 0) {
      return callback(new Error(`No addresses resolved for ${hostname}`), '', 0)
    }
    const offending = addresses.find(({ address }) => !isPublicAddress(address))
    if (offending) {
      return callback(
        new Error(
          `Refusing to connect to ${hostname} — resolved to non-public IP ${offending.address}`,
        ),
        '',
        0,
      )
    }
    const first = addresses[0]
    callback(null, first.address, first.family)
  })
}

const fetchLiveHtml = async (url: string): Promise<LiveFetchResult> => {
  try {
    const res = await axios.get<string>(url, {
      timeout: 10_000,
      responseType: 'text',
      validateStatus: () => true,
      maxRedirects: 5,
      transformResponse: [(data: string) => data],
      httpAgent: new http.Agent({ lookup: ssrfSafeLookup }),
      httpsAgent: new https.Agent({ lookup: ssrfSafeLookup }),
    })
    const body = typeof res.data === 'string' ? res.data : null
    return { status: res.status, body }
  } catch {
    return { status: 0, body: null }
  }
}

// Marker strings are best-effort defaults pending the Peerly spec owner's
// confirmation of the exact required sections (see ENG-10258).
const PRIVACY_POLICY_PATTERN = /privacy policy/i
const TERMS_PATTERN = /terms of service|sms terms|terms and conditions/i

const scoreLiveHtml = (
  url: string,
  fetched: LiveFetchResult,
  candidateName: string | null,
): VerifyLiveResponse => {
  const http200 = fetched.status === 200
  const body = fetched.body ?? ''

  const hasPrivacyPolicy = http200 && PRIVACY_POLICY_PATTERN.test(body)
  const hasTerms = http200 && TERMS_PATTERN.test(body)
  const hasCandidateIdentity =
    http200 &&
    candidateName !== null &&
    candidateName.trim().length > 0 &&
    body.toLowerCase().includes(candidateName.trim().toLowerCase())

  const verified =
    http200 && hasPrivacyPolicy && hasTerms && hasCandidateIdentity

  return {
    verified,
    url,
    checks: {
      http_200: http200,
      has_privacy_policy: hasPrivacyPolicy,
      has_terms: hasTerms,
      has_candidate_identity: hasCandidateIdentity,
    },
  }
}
