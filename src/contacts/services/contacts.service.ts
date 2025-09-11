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
import {
  CONTACTS_SEGMENT_FIELD_NAMES,
  VOTER_FILTER_KEYS,
} from '../contactsSegment/constants/contactsSegment.constants'

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

    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.GENDER_MALE])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_GENDER_MALE] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.GENDER_FEMALE])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_GENDER_FEMALE] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.GENDER_UNKNOWN])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_GENDER_UNKNOWN] = true

    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.AGE_18_25])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_AGE_18_25] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.AGE_25_35])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_AGE_25_35] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.AGE_35_50])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_AGE_35_50] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.AGE_50_PLUS])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_AGE_50_PLUS] = true

    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.POLITICAL_PARTY_DEMOCRAT])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_POLITICAL_PARTY_DEMOCRAT] =
        true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.POLITICAL_PARTY_NON_PARTISAN])
      filters[
        VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_POLITICAL_PARTY_NON_PARTISAN
      ] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.POLITICAL_PARTY_REPUBLICAN])
      filters[
        VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_POLITICAL_PARTY_REPUBLICAN
      ] = true

    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.HAS_CELL_PHONE])
      filters[VOTER_FILTER_KEYS.VOTER_TELEPHONES_CELL_PHONE_FORMATTED] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.HAS_LANDLINE])
      filters[VOTER_FILTER_KEYS.VOTER_TELEPHONES_LANDLINE_FORMATTED] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.HAS_EMAIL])
      filters[VOTER_FILTER_KEYS.VOTER_EMAILS_EMAIL] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.HAS_ADDRESS])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_ADDRESS] = true

    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.REGISTERED_VOTER_YES])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_REGISTERED_VOTER_YES] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.REGISTERED_VOTER_NO])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_REGISTERED_VOTER_NO] = true

    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.ACTIVE_VOTER_YES])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_ACTIVE_VOTER_YES] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.ACTIVE_VOTER_NO])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_ACTIVE_VOTER_NO] = true

    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.VOTER_LIKELY_FIRST_TIME])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_VOTER_LIKELY_FIRST_TIME] =
        true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.VOTER_LIKELY_LIKELY])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_VOTER_LIKELY_LIKELY] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.VOTER_LIKELY_SUPER])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_VOTER_LIKELY_SUPER] = true
    if (segment[CONTACTS_SEGMENT_FIELD_NAMES.VOTER_LIKELY_UNKNOWN])
      filters[VOTER_FILTER_KEYS.VOTER_REGISTRATIONS_VOTER_LIKELY_UNKNOWN] = true

    return filters
  }
}
