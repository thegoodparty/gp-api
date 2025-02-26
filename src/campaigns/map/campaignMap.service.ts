import { Injectable } from '@nestjs/common'
import { MapCampaign } from './campaignMap.types'
import { Campaign, Prisma, User } from '@prisma/client'
import { buildMapFilters } from '../util/buildMapFilters'
import { CampaignsService } from '../services/campaigns.service'
import { GeocodingService } from '../services/geocoding.service'
import { RacesService } from 'src/elections/services/races.service'

type BasicCampaignWithUser = Pick<
  Campaign,
  'id' | 'slug' | 'details' | 'didWin' | 'data'
> & {
  user: Pick<User, 'firstName' | 'lastName' | 'avatar'>
}

@Injectable()
export class CampaignMapService {
  constructor(
    private readonly racesService: RacesService,
    private readonly campaignsService: CampaignsService,
    private readonly geocodingService: GeocodingService,
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
            data: {
              path: ['hubSpotUpdates', 'election_results'],
              equals: 'Won General',
            },
          },
        ],
      },
    ]

    const where: Prisma.CampaignWhereInput = {
      userId: { not: undefined },
      isDemo: false,
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
            data: {
              path: ['hubSpotUpdates', 'election_results'],
              equals: 'Won General',
            },
          },
        ],
      },
    ]

    const where: Prisma.CampaignWhereInput = {
      userId: { not: undefined },
      isDemo: false,
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

    const campaigns = (await this.campaignsService.findMany({
      where,
      select: {
        id: true,
        slug: true,
        details: true,
        didWin: true,
        data: true,
        user: {
          select: {
            firstName: true,
            lastName: true,
            avatar: true,
          },
        },
      },
    })) as BasicCampaignWithUser[]

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
        // TODO: This is a temporary stopgap to get the normalized office name
        // we should just be storing this when creating the campaign!
        const normalizedResult = await this.racesService.getNormalizedPosition(
          details.raceId,
        )

        if (normalizedResult) {
          normalizedOffice = normalizedResult
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
