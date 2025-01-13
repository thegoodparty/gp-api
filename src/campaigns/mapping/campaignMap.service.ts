import { Injectable } from '@nestjs/common'
import { CleanCampaign } from './campaignMap.types'
import { RaceData } from 'src/races/races.types'
import { PrismaService } from 'src/prisma/prisma.service'
import { Prisma } from '@prisma/client'
import { handleGeoLocation } from '../util/geoLocation'
import { buildMapFilters } from '../util/buildMapFilters'
import { CampaignsService } from '../services/campaigns.service'
import { subDays } from 'date-fns'

export const isProd = false // TODO: Centrally locate this logic

@Injectable()
export class CampaignMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
  ) {}

  async listMapCampaignsCount(
    stateFilter?: string,
    resultsFilter?: boolean,
  ): Promise<{ count: number }> {
    const combinedAndConditions: Prisma.CampaignWhereInput[] = [
      ...buildMapFilters({
        stateFilter,
        resultsFilter,
      }),
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
              gte: subDays(new Date(), 7),
            },
          },
        ],
      },
    ]

    const where: Prisma.CampaignWhereInput = {
      userId: { not: null },
      isDemo: false,
      isActive: true,
      AND: combinedAndConditions,
    }

    return {
      count: await this.campaignsService.count({
        where,
      }),
    }
  }

  async listMapCampaigns(
    partyFilter?: string,
    stateFilter?: string,
    levelFilter?: string,
    resultsFilter?: boolean,
    officeFilter?: string,
    nameFilter?: string,
    forceReCalc?: boolean,
  ): Promise<CleanCampaign[]> {
    const combinedAndConditions: Prisma.CampaignWhereInput[] = [
      ...buildMapFilters({
        partyFilter,
        stateFilter,
        levelFilter,
        resultsFilter,
        officeFilter,
      }),
      {
        OR: [
          { didWin: true },
          {
            didWin: null,
            details: {
              path: ['electionDate'],
              gte: subDays(new Date(), 7),
            },
          },
        ],
      },
    ]

    const where: Prisma.CampaignWhereInput = {
      userId: { not: null },
      isDemo: false,
      isActive: true,
      AND: combinedAndConditions,
    }

    if (nameFilter) {
      where.user = {
        AND: [
          {
            OR: [
              { firstName: { contains: nameFilter, mode: 'insensitive' } },
              { lastName: { contains: nameFilter, mode: 'insensitive' } },
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

    const cleanCampaigns: CleanCampaign[] = []

    for (const campaign of campaigns) {
      const { didWin, slug } = campaign
      const details = campaign.details
      const data = campaign.data

      const electionDate = details.electionDate as string

      const resolvedOffice =
        (details.otherOffice as string) || (details.office as string)

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

      const cleanCampaign: CleanCampaign = {
        slug,
        id: campaign.id, // Still not sure if this is ok
        didWin,
        office: resolvedOffice,
        state: details.state || null,
        ballotLevel: details.ballotLevel || null,
        zip: details.zip || null,
        party: details.party || null,
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
        cleanCampaign.globalPosition = globalPosition
      }

      cleanCampaigns.push(cleanCampaign)
    }

    if (updates.length > 0) {
      await Promise.all(
        updates.map((update) => this.campaignsService.update(update)),
      )
    }

    return cleanCampaigns
  }
}
