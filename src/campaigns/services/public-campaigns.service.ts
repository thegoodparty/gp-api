import { Injectable, Logger } from '@nestjs/common'
import slugify from 'slugify'
import { createPrismaBase, MODELS } from '../../prisma/util/prisma.util'
import { FindByRaceIdDto } from '../schemas/public/FindByRaceId.schema'
import { FindByRaceIdResponse } from '../schemas/public/FindByRaceIdResponse.schema'

@Injectable()
export class PublicCampaignsService extends createPrismaBase(MODELS.Campaign) {
  public readonly logger = new Logger(PublicCampaignsService.name)

  async findCampaignByRaceId(
    params: FindByRaceIdDto,
  ): Promise<FindByRaceIdResponse> {
    const { raceId, firstName, lastName } = params

    try {
      const campaigns = await this.findMany({
        where: {
          details: {
            path: ['raceId'],
            equals: raceId,
          },
          isActive: true,
        },
        select: {
          id: true,
          slug: true,
          details: true,
          updatedAt: true,

          website: {
            select: {
              id: true,
              createdAt: true,
              updatedAt: true,
              campaignId: true,
              status: true,
              vanityPath: true,
              content: true,
              domain: {
                select: {
                  name: true,
                  status: true,
                },
              },
            },
          },
          campaignPositions: {
            select: {
              description: true,
              position: {
                select: {
                  name: true,
                },
              },
              topIssue: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      })

      if (campaigns.length === 0) {
        return null
      }

      const campaignsWithLastName = campaigns.filter((campaign) =>
        this.matchesCandidateName(campaign.slug, '', lastName),
      )

      if (campaignsWithLastName.length === 0) {
        return null
      }

      if (campaignsWithLastName.length === 1) {
        return campaignsWithLastName[0]
      }

      const campaignsWithBothNames = campaignsWithLastName.filter((campaign) =>
        this.matchesCandidateName(campaign.slug, firstName, lastName),
      )

      return campaignsWithBothNames.length > 0
        ? campaignsWithBothNames[0]
        : campaignsWithLastName[0]
    } catch (error) {
      this.logger.error('Error in findCampaignByRaceId:', error)
      return null
    }
  }

  private normalizeToTokens(value: string): string[] {
    return slugify(value, { lower: true, strict: true })
      .split('-')
      .filter(Boolean)
  }

  private slugHasAllTokens(
    campaignSlug: string,
    requiredTokens: string[],
  ): boolean {
    const campaignTokens = campaignSlug.split('-').filter(Boolean)
    const set = new Set(campaignTokens)
    return requiredTokens.every((token) => set.has(token))
  }

  private matchesCandidateName(
    campaignSlug: string,
    firstName: string,
    lastName: string,
  ): boolean {
    const lastTokens = this.normalizeToTokens(lastName)
    if (lastTokens.length && !this.slugHasAllTokens(campaignSlug, lastTokens)) {
      return false
    }

    if (firstName) {
      const firstTokens = this.normalizeToTokens(firstName)
      if (
        firstTokens.length &&
        !this.slugHasAllTokens(campaignSlug, firstTokens)
      ) {
        return false
      }
    }

    return true
  }
}
