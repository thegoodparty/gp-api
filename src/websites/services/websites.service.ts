import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { Prisma, User } from '@prisma/client'
import axios from 'axios'
import { CampaignWith } from 'src/campaigns/campaigns.types'
import { getUserFullName } from 'src/users/util/users.util'
import { VerifyLiveResponse } from '../schemas/VerifyLive.schema'

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
    const html = await fetchLiveHtml(url)
    const user = website.campaign?.user
    const candidateName = user
      ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
      : null

    return scoreLiveHtml(url, html, candidateName)
  }
}

type LiveFetchResult = { status: number; body: string | null }

const fetchLiveHtml = async (url: string): Promise<LiveFetchResult> => {
  try {
    const res = await axios.get<string>(url, {
      timeout: 10_000,
      responseType: 'text',
      validateStatus: () => true,
      transformResponse: [(data: string) => data],
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
