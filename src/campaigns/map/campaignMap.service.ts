import { Injectable } from '@nestjs/common'
import { MapCampaign } from './campaignMap.types'
import { RaceData } from 'src/races/races.types'
import { PrismaService } from 'src/prisma/prisma.service'
import { Prisma } from '@prisma/client'
import { buildMapFilters } from '../util/buildMapFilters'
import { CampaignsService } from '../services/campaigns.service'
import { subDays } from 'date-fns'
import { GeocodingService } from '../services/geocoding.service'
import { RacesService } from 'src/races/races.service'

export const isProd = false // TODO: Centrally locate this logic

@Injectable()
export class CampaignMapService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly campaignsService: CampaignsService,
    private readonly geocodingService: GeocodingService,
    private readonly racesService: RacesService,
  ) {}

  async listMapCampaignsCount(
    stateFilter?: string,
    resultsFilter?: boolean,
  ): Promise<number> {
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

    return await this.campaignsService.count({ where })
  }

  async listMapCampaigns(
    partyFilter?: string,
    stateFilter?: string,
    levelFilter?: string,
    resultsFilter?: boolean,
    officeFilter?: string,
    nameFilter?: string,
    forceReCalc?: boolean,
  ): Promise<MapCampaign[]> {
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

    const mapCampaigns: MapCampaign[] = []

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
        const race = await this.racesService.findFirst({
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

      const mapCampaign: MapCampaign = {
        slug,
        id: campaign.id,
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

      const globalPosition = await this.geocodingService.handleGeoLocation(
        slug,
        details,
        forceReCalc,
      )
      if (!globalPosition) {
        continue
      } else {
        mapCampaign.globalPosition = globalPosition
      }

      mapCampaigns.push(mapCampaign)
    }

    if (updates.length > 0) {
      await Promise.all(
        updates.map((update) => this.campaignsService.update(update)),
      )
    }

    return mapCampaigns
  }
}
