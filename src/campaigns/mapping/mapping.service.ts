import { Injectable } from '@nestjs/common'
import { CampaignUpdate, sevenDaysAgo } from '../campaigns.types'
import { RaceData } from 'src/races/races.types'
import { PrismaService } from 'src/prisma/prisma.service'
import { Prisma, Campaign } from '@prisma/client'
import { handleGeoLocation } from '../util/geoLocation'
import { buildMapFilters } from '../util/buildMapFilters'

const APP_BASE = process.env.CORS_ORIGIN as string
const isProd = APP_BASE === 'https://goodparty.org'

@Injectable()
export class MappingService {
  constructor(private readonly prisma: PrismaService) {}

  async listMapCount(
    state?: string,
    results?: boolean,
  ): Promise<{ count: number }> {
    const baseAndConditions = buildMapFilters({ state, results, isProd })

    const additionalAndConditions: Prisma.CampaignWhereInput[] = [
      {
        details: {
          path: ['geoLocation', 'lng'],
          not: { equals: null },
        },
      },
      {
        details: {
          path: ['geoLocationFailed'],
          equals: false,
        },
      },
      {
        OR: [
          { didWin: true },
          {
            didWin: null,
            details: {
              path: ['electionDate'],
              gte: sevenDaysAgo,
            },
          },
        ],
      },
    ]

    const combinedAndConditions: Prisma.CampaignWhereInput[] = [
      ...baseAndConditions,
      ...additionalAndConditions,
    ]

    const where: Prisma.CampaignWhereInput = {
      userId: { not: null },
      isDemo: false,
      isActive: true,
      AND: combinedAndConditions,
    }
    const count = await this.prisma.campaign.count({
      where,
    })

    return { count }
  }

  async listMap(
    party?: string,
    state?: string,
    level?: string,
    results?: boolean,
    office?: string,
    name?: string,
    forceReCalc?: boolean,
  ): Promise<CampaignUpdate[]> {
    const baseAndConditions = buildMapFilters({
      party,
      state,
      level,
      results,
      office,
      isProd,
    })

    const additionalFilters: Prisma.CampaignWhereInput = {
      OR: [
        { didWin: true },
        {
          didWin: null,
          details: {
            path: ['electionDate'],
            gte: sevenDaysAgo,
          },
        },
      ],
    }

    const combinedAndConditions: Prisma.CampaignWhereInput[] = [
      ...baseAndConditions,
      additionalFilters,
    ]

    const where: Prisma.CampaignWhereInput = {
      userId: { not: null },
      isDemo: false,
      isActive: true,
      AND: combinedAndConditions,
    }

    if (name) {
      where.user = {
        AND: [
          {
            OR: [
              { firstName: { contains: name, mode: 'insensitive' } },
              { lastName: { contains: name, mode: 'insensitive' } },
            ],
          },
        ],
      }
    }

    const campaigns = await this.prisma.campaign.findMany({
      where,
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    })

    const updates: Prisma.CampaignUpdateArgs[] = []

    const campaignUpdates: CampaignUpdate[] = []

    for (const campaign of campaigns) {
      const { didWin, slug } = campaign
      const details = campaign.details
      const data = campaign.data

      if (!details?.zip || didWin === false || details?.geoLocationFailed) {
        // Test this
        console.log('Failed first joint check')
        continue
      }
      const electionDate = details.electionDate as string

      const resolvedOffice =
        (details.otherOffice as string) || (office as string)

      let normalizedOffice =
        data?.hubSpotUpdates?.office_type || details?.normalizedOffice

      if (!normalizedOffice && details.raceId && !details.noNormalizedOffice) {
        const race = await this.prisma.race.findFirst({
          where: { ballotHashId: details.raceId },
        })
        if (race) {
          const raceData = race.data as RaceData
          normalizedOffice = raceData?.normalized_position_name
        }

        const updateData: Prisma.CampaignUpdateInput = {}
        if (normalizedOffice) {
          updateData.details = { ...details, normalizedOffice }
        } else {
          updateData.details = { ...details, noNormalizedOffice: true }
        }

        updates.push({
          where: { slug },
          data: updateData,
        })
      }

      const campaignUpdate: CampaignUpdate = {
        slug,
        id: slug,
        didWin,
        office: resolvedOffice,
        state: state || null,
        ballotLevel: details.ballotLevel || null,
        zip: details.zip || null,
        party: party || null,
        firstName: campaign.user?.firstName || '',
        lastName: campaign.user?.lastName || '',
        avatar: campaign.user?.avatar || false,
        electionDate,
        county: details.county || null,
        city: details.city || null,
        normalizedOffice: normalizedOffice || resolvedOffice,
      }

      const globalPosition = await handleGeoLocation(
        slug,
        details,
        forceReCalc,
        this.prisma,
      )
      if (!globalPosition) {
        continue
      } else {
        campaignUpdate.globalPosition = globalPosition
      }

      campaignUpdates.push(campaignUpdate)
    }

    if (updates.length > 0) {
      await Promise.all(
        updates.map((update) => this.prisma.campaign.update(update)),
      )
    }

    return campaignUpdates
  }
}
