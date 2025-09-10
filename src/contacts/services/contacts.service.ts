import {
  Injectable,
  BadGatewayException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { Campaign, PathToVictory } from '@prisma/client'
import { lastValueFrom } from 'rxjs'
import { ListContactsDTO } from '../schemas/listContacts.schema'
import jwt from 'jsonwebtoken'
import defaultSegmentToFiltersMap from './segmentsToFiltersMap.const'

type CampaignWithPathToVictory = Campaign & {
  pathToVictory?: PathToVictory | null
}

const { PEOPLE_API_URL, PEOPLE_API_S2S_SECRET } = process.env

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name)
  private cachedToken: string | null = null
  private tokenExpiration: number = 0

  constructor(private readonly httpService: HttpService) {
    if (!PEOPLE_API_URL) {
      throw new BadGatewayException(
        'PEOPLE_API_URL environment variable not configured',
      )
    }
    if (!PEOPLE_API_S2S_SECRET) {
      throw new BadGatewayException(
        'PEOPLE_API_S2S_SECRET environment variable not configured',
      )
    }
  }

  async findContacts(
    dto: ListContactsDTO,
    campaign: CampaignWithPathToVictory,
  ) {
    const { resultsPerPage, page, segment } = dto
    console.log('segment', segment, typeof segment)
    const segmentToFiltersMap =
      defaultSegmentToFiltersMap[
        segment as keyof typeof defaultSegmentToFiltersMap
      ]
    console.log('segmentToFiltersMap', segmentToFiltersMap)

    const locationData = this.extractLocationFromCampaign(campaign)

    const params = new URLSearchParams({
      state: locationData.state,
      districtType: locationData.districtType,
      districtName: locationData.districtName,
      resultsPerPage: resultsPerPage.toString(),
      page: page.toString(),
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

  private getValidS2SToken(): string {
    const now = Math.floor(Date.now() / 1000)
    const bufferTime = 60

    if (this.cachedToken && this.tokenExpiration > now + bufferTime) {
      return this.cachedToken
    }

    return this.generateAndCacheS2SToken()
  }

  private generateAndCacheS2SToken(): string {
    const now = Math.floor(Date.now() / 1000)
    const expirationTime = now + 300

    const payload = {
      iss: 'gp-api',
      iat: now,
      exp: expirationTime,
    }

    this.cachedToken = jwt.sign(payload, PEOPLE_API_S2S_SECRET!)
    this.tokenExpiration = expirationTime

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

    const districtType = electionType.replace(/_/g, ' ')

    if (!state || state.length !== 2) {
      throw new BadRequestException('Invalid state code in campaign data')
    }

    return {
      state,
      districtType,
      districtName: electionLocation,
    }
  }
}
