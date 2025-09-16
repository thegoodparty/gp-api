import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { Campaign, VoterFileFilter, PathToVictory } from '@prisma/client'
import { FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { lastValueFrom } from 'rxjs'
import { ElectionsService } from 'src/elections/services/elections.service'
import { VoterFileFilterService } from 'src/voters/services/voterFileFilter.service'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from '../schemas/listContacts.schema'
import defaultSegmentToFiltersMap from './segmentsToFiltersMap.const'

type CampaignWithPathToVictory = Campaign & {
  pathToVictory?: PathToVictory | null
}

const { PEOPLE_API_URL, PEOPLE_API_S2S_SECRET } = process.env

if (!PEOPLE_API_URL) {
  throw new Error('Please set PEOPLE_API_URL in your .env')
}
if (!PEOPLE_API_S2S_SECRET) {
  throw new Error('Please set PEOPLE_API_S2S_SECRET in your .env')
}

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name)
  private cachedToken: string | null = null

  constructor(
    private readonly httpService: HttpService,
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly elections: ElectionsService,
  ) {}

  async findContacts(
    dto: ListContactsDTO,
    campaign: CampaignWithPathToVictory,
  ) {
    const { resultsPerPage, page, segment } = dto
    const filters = await this.segmentToFilters(segment, campaign)

    const locationData = this.extractLocationFromCampaign(campaign)

    const params = new URLSearchParams({
      state: locationData.state,
      districtType: locationData.districtType,
      districtName: locationData.districtName,
      resultsPerPage: resultsPerPage.toString(),
      page: page.toString(),
    })

    filters.forEach((filter) => {
      params.append('filters', filter)
    })

    try {
      const token = this.getValidS2SToken()
      const response = await lastValueFrom(
        this.httpService.get(
          `${PEOPLE_API_URL}/v1/people/list?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      )
      return response.data
    } catch (error) {
      this.logger.error('Failed to fetch contacts from people API', error)
      throw new BadGatewayException('Failed to fetch contacts from people API')
    }
  }

  async downloadContacts(
    dto: DownloadContactsDTO,
    campaign: CampaignWithPathToVictory,
    res: FastifyReply,
  ) {
    const segment = dto.segment as string | undefined
    const filters = await this.segmentToFilters(segment, campaign)

    const locationData = this.extractLocationFromCampaign(campaign)

    const params = new URLSearchParams({
      state: locationData.state,
      districtType: locationData.districtType,
      districtName: locationData.districtName,
    })

    filters.forEach((filter) => {
      params.append('filters', filter)
    })

    try {
      const token = this.getValidS2SToken()
      const response = await lastValueFrom(
        this.httpService.get(
          `${PEOPLE_API_URL}/v1/people/download?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            responseType: 'stream',
          },
        ),
      )

      return new Promise<void>((resolve, reject) => {
        response.data.pipe(res.raw)
        response.data.on('end', resolve)
        response.data.on('error', reject)
      })
    } catch (error) {
      this.logger.error('Failed to download contacts from people API', error)
      throw new BadGatewayException(
        'Failed to download contacts from people API',
      )
    }
  }

  private getValidS2SToken(): string {
    if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
      return this.cachedToken
    }

    return this.generateAndCacheS2SToken()
  }

  private isTokenValid(token: string): boolean {
    try {
      const decoded = jwt.decode(token) as { exp?: number }
      if (!decoded || !decoded.exp) {
        return false
      }

      const now = Math.floor(Date.now() / 1000)
      const bufferTime = 60

      return decoded.exp > now + bufferTime
    } catch {
      return false
    }
  }

  private generateAndCacheS2SToken(): string {
    const now = Math.floor(Date.now() / 1000)

    const payload = {
      iss: 'gp-api',
      iat: now,
      exp: now + 300,
    }

    this.cachedToken = jwt.sign(payload, PEOPLE_API_S2S_SECRET!)

    return this.cachedToken
  }

  private extractLocationFromCampaign(campaign: CampaignWithPathToVictory): {
    state: string
    districtType: string
    districtName: string
  } {
    const pathToVictoryData = campaign.pathToVictory?.data as {
      electionType?: string
      electionLocation?: string
    }
    const electionType = pathToVictoryData?.electionType
    const electionLocation = pathToVictoryData?.electionLocation

    if (!electionType || !electionLocation) {
      throw new BadRequestException(
        'Campaign path to victory data is missing required election information',
      )
    }

    if (!campaign.details) {
      throw new BadRequestException('Campaign details are missing')
    }

    const state = campaign.details.state

    if (!state || state.length !== 2) {
      throw new BadRequestException('Invalid state code in campaign data')
    }

    return {
      state,
      districtType: electionType,
      districtName: this.elections.cleanDistrictName(electionLocation),
    }
  }

  private async segmentToFilters(
    segment: string | undefined,
    campaign: CampaignWithPathToVictory,
  ): Promise<string[]> {
    const resolvedSegment = segment || 'all'
    const segmentToFiltersMap =
      defaultSegmentToFiltersMap[
        resolvedSegment as keyof typeof defaultSegmentToFiltersMap
      ]

    return segmentToFiltersMap
      ? segmentToFiltersMap.filters
      : await this.getCustomSegmentFilters(resolvedSegment, campaign)
  }

  private async getCustomSegmentFilters(
    segment: string,
    campaign: CampaignWithPathToVictory,
  ): Promise<string[]> {
    const customSegment =
      await this.voterFileFilterService.findByIdAndCampaignId(
        parseInt(segment),
        campaign.id,
      )

    return customSegment
      ? this.convertVoterFileFilterToFilters(customSegment)
      : []
  }

  private convertVoterFileFilterToFilters(segment: VoterFileFilter): string[] {
    const filters: string[] = []

    if (segment.genderMale) filters.push('genderMale')
    if (segment.genderFemale) filters.push('genderFemale')
    if (segment.genderUnknown) filters.push('genderUnknown')

    if (segment.age18_25) filters.push('age18_25')
    if (segment.age25_35) filters.push('age25_35')
    if (segment.age35_50) filters.push('age35_50')
    if (segment.age50Plus) filters.push('age50Plus')

    if (segment.partyDemocrat) filters.push('partyDemocrat')
    if (segment.partyIndependent) filters.push('partyIndependent')
    if (segment.partyRepublican) filters.push('partyRepublican')

    if (segment.audienceFirstTimeVoters) filters.push('audienceFirstTimeVoters')
    if (segment.audienceLikelyVoters) filters.push('audienceLikelyVoters')
    if (segment.audienceSuperVoters) filters.push('audienceSuperVoters')

    if (segment.hasCellPhone) filters.push('cellPhoneFormatted')
    if (segment.hasLandline) filters.push('landlineFormatted')

    return filters
  }
}
