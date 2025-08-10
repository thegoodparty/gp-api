import { Injectable, Logger } from '@nestjs/common'
import { createPrismaBase, MODELS } from '../../prisma/util/prisma.util'
import { FindByRaceIdDto } from '../schemas/public/FindByRaceId.schema'
import { FindByRaceIdResponse } from '../schemas/public/FindByRaceIdResponse.schema'
import slugify from 'slugify'

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
            include: {
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

      const lastNameSlug = this.createCandidateSlug('', lastName)
      const campaignsWithLastName = campaigns.filter((campaign) =>
        this.matchesCandidateName(campaign.slug, lastNameSlug),
      )

      if (campaignsWithLastName.length === 0) {
        return null
      }

      if (campaignsWithLastName.length === 1) {
        return campaignsWithLastName[0]
      }

      const firstNameSlug = this.createCandidateSlug(firstName, '')
      const campaignsWithBothNames = campaignsWithLastName.filter((campaign) =>
        this.matchesCandidateName(campaign.slug, firstNameSlug),
      )

      return campaignsWithBothNames.length > 0
        ? campaignsWithBothNames[0]
        : campaignsWithLastName[0]
    } catch (error) {
      this.logger.error('Error in findCampaignByRaceId:', error)
      return null
    }
  }

  private createCandidateSlug(firstName: string, lastName: string): string {
    return slugify(`${firstName} ${lastName}`, {
      lower: true,
      strict: true,
    })
  }

  private matchesCandidateName(
    campaignSlug: string,
    nameSlug: string,
  ): boolean {
    if (!nameSlug.trim()) {
      return true
    }

    const normalizedCampaignSlug = campaignSlug.replace(/-/g, '')
    const normalizedNameSlug = nameSlug.replace(/-/g, '')

    const slugParts = normalizedCampaignSlug.split(/[^a-z0-9]/i)

    return slugParts.some((part) => part === normalizedNameSlug)
  }
}
