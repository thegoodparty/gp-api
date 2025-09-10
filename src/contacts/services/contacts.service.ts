import {
  Injectable,
  BadGatewayException,
  BadRequestException,
  Logger,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { Campaign, PathToVictory, ContactsSegment } from '@prisma/client'
import { lastValueFrom } from 'rxjs'
import { ListContactsDTO } from '../schemas/listContacts.schema'
import jwt from 'jsonwebtoken'
import defaultSegmentToFiltersMap from './segmentsToFiltersMap.const'
import { ContactsSegmentService } from '../contactsSegment/services/contactsSegment.service'

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
    private readonly contactsSegmentService: ContactsSegmentService,
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
      ...Object.fromEntries(
        Object.entries(filters).map(([key, value]) => [key, String(value)]),
      ),
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

  private async segmentToFilters(
    segment: string | undefined,
    campaign: CampaignWithPathToVictory,
  ) {
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
  ) {
    const customSegment =
      await this.contactsSegmentService.findByIdAndCampaignId(
        parseInt(segment),
        campaign.id,
      )

    return customSegment
      ? this.convertContactsSegmentToFilters(customSegment)
      : {}
  }

  private convertContactsSegmentToFilters(
    segment: ContactsSegment,
  ): Record<string, boolean> {
    const filters: Record<string, boolean> = {}

    if (segment.genderMale) filters['VoterRegistrations_Gender_Male'] = true
    if (segment.genderFemale) filters['VoterRegistrations_Gender_Female'] = true
    if (segment.genderUnknown)
      filters['VoterRegistrations_Gender_Unknown'] = true

    if (segment.age18_25) filters['VoterRegistrations_Age_18_25'] = true
    if (segment.age25_35) filters['VoterRegistrations_Age_25_35'] = true
    if (segment.age35_50) filters['VoterRegistrations_Age_35_50'] = true
    if (segment.age50Plus) filters['VoterRegistrations_Age_50Plus'] = true

    if (segment.politicalPartyDemocrat)
      filters['VoterRegistrations_PoliticalParty_Democrat'] = true
    if (segment.politicalPartyNonPartisan)
      filters['VoterRegistrations_PoliticalParty_NonPartisan'] = true
    if (segment.politicalPartyRepublican)
      filters['VoterRegistrations_PoliticalParty_Republican'] = true

    if (segment.hasCellPhone)
      filters['VoterTelephones_CellPhoneFormatted'] = true
    if (segment.hasLandline) filters['VoterTelephones_LandlineFormatted'] = true
    if (segment.hasEmail) filters['VoterEmails_Email'] = true
    if (segment.hasAddress) filters['VoterRegistrations_Address'] = true

    if (segment.registeredVoterYes)
      filters['VoterRegistrations_RegisteredVoter_Yes'] = true
    if (segment.registeredVoterNo)
      filters['VoterRegistrations_RegisteredVoter_No'] = true

    if (segment.activeVoterYes)
      filters['VoterRegistrations_ActiveVoter_Yes'] = true
    if (segment.activeVoterNo)
      filters['VoterRegistrations_ActiveVoter_No'] = true

    if (segment.voterLikelyFirstTime)
      filters['VoterRegistrations_VoterLikely_FirstTime'] = true
    if (segment.voterLikelyLikely)
      filters['VoterRegistrations_VoterLikely_Likely'] = true
    if (segment.voterLikelySuper)
      filters['VoterRegistrations_VoterLikely_Super'] = true
    if (segment.voterLikelyUnknown)
      filters['VoterRegistrations_VoterLikely_Unknown'] = true

    return filters
  }
}
