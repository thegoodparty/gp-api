import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { isAxiosError } from 'axios'
import { FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { lastValueFrom } from 'rxjs'
import { BallotReadyPositionLevel } from 'src/campaigns/campaigns.types'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ElectionsService } from 'src/elections/services/elections.service'
import { SHORT_TO_LONG_STATE } from 'src/shared/constants/states'
import { VoterFileFilterService } from 'src/voters/services/voterFileFilter.service'
import { CampaignWithPathToVictory, StatsResponse } from '../contacts.types'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from '../schemas/listContacts.schema'
import {
  PeopleListResponse,
  PersonListItem,
  PersonOutput,
} from '../schemas/person.schema'
import type { SampleContacts } from '../schemas/sampleContacts.schema'
import defaultSegmentToFiltersMap from '../segmentsToFiltersMap.const'
import {
  convertVoterFileFilterToFilters,
  type FilterObject,
} from '../utils/voterFileFilter.utils'

const P2V_ELECTION_INFO_MISSING_MESSAGE =
  'Campaign path to victory data is missing required election information'

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
    private readonly campaigns: CampaignsService,
  ) {}

  async findContacts(
    { resultsPerPage, page, search, segment }: ListContactsDTO,
    campaign: CampaignWithPathToVictory,
  ) {
    if (search && !campaign.isPro) {
      throw new BadRequestException(
        'Search is only available for pro campaigns',
      )
    }

    const {
      state,
      districtType,
      districtName,
      alternativeDistrictName,
      usingStatewideFallback,
    } = this.resolveLocationForRequest(campaign)

    const filters = await this.segmentToFilters(segment, campaign)

    const body = {
      state,
      districtType,
      districtName,
      resultsPerPage,
      page,
      filters,
      search,
      full: true,
    }

    const token = usingStatewideFallback
      ? this.generateScopedS2SToken(state)
      : this.getValidS2SToken()

    try {
      const response = await lastValueFrom(
        this.httpService.post(`${PEOPLE_API_URL}/v1/people`, body, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      )
      if (
        response.data.pagination?.totalResults <= 0 &&
        alternativeDistrictName
      ) {
        const alternativeResponse = await lastValueFrom(
          this.httpService.post(
            `${PEOPLE_API_URL}/v1/people`,
            {
              ...body,
              districtName: alternativeDistrictName,
            },
            { headers: { Authorization: `Bearer ${token}` } },
          ),
        )
        const altData = alternativeResponse.data as PeopleListResponse
        if (alternativeDistrictName) {
          await this.updateCampaignDistrictNameIfSuccessful(
            campaign.id,
            alternativeDistrictName,
            altData.pagination.totalResults > 0,
          )
        }
        return altData
      }
      return response.data as PeopleListResponse
    } catch (error) {
      this.logger.error(`Failed to fetch from people API`, {
        error,
      })
      throw new BadGatewayException(`Failed to fetch from people API`)
    }
  }

  async sampleContacts(
    dto: SampleContacts,
    campaign: CampaignWithPathToVictory,
  ) {
    const locationData = this.extractLocationFromCampaign(campaign)

    const body = {
      state: locationData.state,
      districtType: locationData.districtType,
      districtName: locationData.districtName,
      size: String(dto.size ?? 500),
      hasCellPhone: 'true',
      full: 'true',
      excludeIds: (dto.excludeIds ?? []) as string[],
    }

    try {
      const token = this.getValidS2SToken()
      const response = await lastValueFrom(
        this.httpService.post(`${PEOPLE_API_URL}/v1/people/sample`, body, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }),
      )
      const people = this.normalizePeopleResponse(response.data)
      return people
    } catch (error) {
      this.logger.error('Failed to sample contacts from people API', error)
      throw new BadGatewayException('Failed to sample contacts from people API')
    }
  }

  async findPerson(
    id: string,
    campaign: CampaignWithPathToVictory,
  ): Promise<PersonOutput> {
    try {
      const { state, districtType, districtName, usingStatewideFallback } =
        this.resolveLocationForRequest(campaign)

      const response = await lastValueFrom(
        this.httpService.get(`${PEOPLE_API_URL}/v1/people/${id}`, {
          headers: {
            Authorization: `Bearer ${this.getValidS2SToken()}`,
          },
          params: {
            state,
          },
        }),
      )

      const person = response.data as PersonOutput &
        Record<string, string | number | boolean | null | undefined>

      const personState = String(person.state || '').toUpperCase()
      const stateMatches = personState === state.toUpperCase()

      if (usingStatewideFallback) {
        if (!stateMatches) throw new NotFoundException('Person not found')
        return person
      }

      if (!districtType || !districtName) {
        throw new BadRequestException({
          message: P2V_ELECTION_INFO_MISSING_MESSAGE,
          errorCode: 'DATA_INTEGRITY_P2V_ELECTION_INFO_MISSING',
        })
      }

      if (!stateMatches) throw new NotFoundException('Person not found')
      return person
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error(
        'Failed to fetch person from people API',
        JSON.stringify(error),
      )

      if (isAxiosError(error) && error.response?.status === 404) {
        throw new NotFoundException('Person not found')
      }

      throw new BadGatewayException('Failed to fetch person from people API')
    }
  }

  async downloadContacts(
    dto: DownloadContactsDTO,
    campaign: CampaignWithPathToVictory,
    res: FastifyReply,
  ) {
    if (!campaign.isPro) {
      throw new BadRequestException('Campaign is not pro')
    }
    const segment = dto.segment as string | undefined

    const {
      state,
      districtType,
      districtName,
      alternativeDistrictName,
      usingStatewideFallback,
    } = this.resolveLocationForRequest(campaign)

    const params = new URLSearchParams({ state })
    if (districtType && districtName) {
      params.set('districtType', districtType)
      params.set('districtName', districtName)
    }

    const filters = await this.segmentToFilters(segment, campaign)

    const body: Record<string, unknown> = {
      state,
      districtType,
      districtName,
      filters,
      full: true,
    }

    let token: string | undefined
    try {
      token = usingStatewideFallback
        ? this.generateScopedS2SToken(state)
        : this.getValidS2SToken()
      const response = await lastValueFrom(
        this.httpService.post(`${PEOPLE_API_URL}/v1/people/download`, body, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          responseType: 'stream',
        }),
      )

      return new Promise<void>((resolve, reject) => {
        response.data.pipe(res.raw)
        response.data.on('end', resolve)
        response.data.on('error', reject)
      })
    } catch (error) {
      this.logger.error('Failed to download contacts from people API', {
        error,
      })
      if (token) {
        const alternativeResponse = await this.queryAlternativeDistrictName(
          params,
          token,
          'download',
          alternativeDistrictName,
          { responseType: 'stream', body },
        )
        return new Promise<void>((resolve, reject) => {
          alternativeResponse.data.pipe(res.raw)
          alternativeResponse.data.on('end', resolve)
          alternativeResponse.data.on('error', reject)
        })
      }

      throw new BadGatewayException(
        'Failed to download contacts from people API',
      )
    }
  }

  async getDistrictStats(campaign: CampaignWithPathToVictory) {
    const { state, districtType, districtName } =
      this.resolveLocationForRequest(campaign)

    if (!state || !districtType || !districtName) {
      const msg = 'Could not resolve state, district type, and district name'
      this.logger.error(
        JSON.stringify({ campaign, msg, state, districtType, districtName }),
      )
      throw new BadRequestException(msg)
    }

    const token = this.getValidS2SToken()

    const response = await lastValueFrom(
      this.httpService.get<StatsResponse>(`${PEOPLE_API_URL}/v1/people/stats`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          state,
          districtType,
          districtName,
        },
      }),
    )

    return response.data
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

  private canUseStatewideFallback(
    campaign: CampaignWithPathToVictory,
  ): boolean {
    const ballotLevel = (
      campaign.details as { ballotLevel?: BallotReadyPositionLevel } | null
    )?.ballotLevel
    const canDownloadFederal = (
      campaign as {
        canDownloadFederal?: boolean
      }
    ).canDownloadFederal
    return (
      (ballotLevel === BallotReadyPositionLevel.FEDERAL ||
        ballotLevel === BallotReadyPositionLevel.STATE) &&
      Boolean(canDownloadFederal)
    )
  }

  private getCampaignState(campaign: CampaignWithPathToVictory): string {
    if (!campaign.details) {
      throw new BadRequestException({
        message: 'Campaign details are missing',
        errorCode: 'DATA_INTEGRITY_CAMPAIGN_DETAILS_MISSING',
      })
    }
    const { state } = campaign.details as { state?: string }
    if (!state || state.length !== 2) {
      throw new BadRequestException({
        message: 'Invalid state code in campaign data',
        errorCode: 'DATA_INTEGRITY_CAMPAIGN_STATE_INVALID',
      })
    }
    return state.toUpperCase()
  }

  private resolveLocationForRequest(campaign: CampaignWithPathToVictory): {
    state: string
    districtType?: string
    districtName?: string
    alternativeDistrictName?: string
    usingStatewideFallback: boolean
  } {
    const state = this.getCampaignState(campaign)

    const ptv = campaign.pathToVictory?.data as
      | { electionType?: string; electionLocation?: string }
      | undefined
    const electionType = ptv?.electionType
    const electionLocation = ptv?.electionLocation

    if (electionType && electionLocation) {
      const cleanedName = this.elections.cleanDistrictName(electionLocation)
      const alternativeCleanedName = cleanedName.replace(/^0/, '') // Delete 1 leading zero
      const isStatewide = this.isStatewideSelection(
        state,
        electionType,
        cleanedName,
      )

      if (isStatewide) {
        if (!this.canUseStatewideFallback(campaign)) {
          throw new BadRequestException(
            'Statewide or federal contacts require admin approval',
          )
        }
        return { state, usingStatewideFallback: true }
      }

      return {
        state,
        districtType: electionType,
        districtName: cleanedName,
        alternativeDistrictName: alternativeCleanedName,
        usingStatewideFallback: false,
      }
    }

    if (this.canUseStatewideFallback(campaign)) {
      return { state, usingStatewideFallback: true }
    }

    throw new BadRequestException({
      message: P2V_ELECTION_INFO_MISSING_MESSAGE,
      errorCode: 'DATA_INTEGRITY_P2V_ELECTION_INFO_MISSING',
    })
  }

  private isStatewideSelection(
    stateCode: string,
    electionType: string,
    districtName: string,
  ): boolean {
    const type = electionType.toLowerCase()
    const stateLong =
      SHORT_TO_LONG_STATE[stateCode as keyof typeof SHORT_TO_LONG_STATE]
    const matchesCode = districtName.toUpperCase() === stateCode.toUpperCase()
    const matchesLong =
      typeof stateLong === 'string' &&
      districtName.toLowerCase() === stateLong.toLowerCase()
    return type === 'state' ? matchesCode || matchesLong : false
  }

  private generateScopedS2SToken(state: string): string {
    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: 'gp-api',
      aud: 'people-api',
      sub: 'contacts',
      iat: now,
      exp: now + 300,
      allowStatewide: true,
      state,
    }
    return jwt.sign(payload, PEOPLE_API_S2S_SECRET!)
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
      throw new BadRequestException({
        message: P2V_ELECTION_INFO_MISSING_MESSAGE,
        errorCode: 'DATA_INTEGRITY_P2V_ELECTION_INFO_MISSING',
      })
    }

    if (!campaign.details) {
      throw new BadRequestException({
        message: 'Campaign details are missing',
        errorCode: 'DATA_INTEGRITY_CAMPAIGN_DETAILS_MISSING',
      })
    }

    const { state } = campaign.details as { state?: string }

    if (!state || state.length !== 2) {
      throw new BadRequestException({
        message: 'Invalid state code in campaign data',
        errorCode: 'DATA_INTEGRITY_CAMPAIGN_STATE_INVALID',
      })
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
  ): Promise<FilterObject> {
    const resolvedSegment = segment || 'all'
    const segmentToFiltersMap =
      defaultSegmentToFiltersMap[
        resolvedSegment as keyof typeof defaultSegmentToFiltersMap
      ]

    if (segmentToFiltersMap) {
      const filters: Record<string, boolean> = {}
      for (const filterName of segmentToFiltersMap.filters) {
        filters[filterName] = true
      }
      return filters
    }

    const customSegment =
      await this.voterFileFilterService.findByIdAndCampaignId(
        parseInt(resolvedSegment),
        campaign.id,
      )

    return customSegment ? convertVoterFileFilterToFilters(customSegment) : {}
  }

  private normalizePeopleResponse(
    data:
      | PeopleListResponse
      | PersonListItem[]
      | { people: PersonListItem[] }
      | Record<string, PersonListItem>,
  ): PersonListItem[] {
    if (Array.isArray(data)) return data
    if (typeof data === 'object' && data !== null) {
      if ('people' in data) return (data as { people: PersonListItem[] }).people
      const values = Object.values(data as Record<string, PersonListItem>)
      return values
    }
    return []
  }

  private async queryAlternativeDistrictName(
    params: URLSearchParams,
    token: string,
    endpoint: 'people' | 'search' | 'download' | 'stats',
    alternativeDistrictName?: string,
    options?: { responseType?: 'stream'; body?: Record<string, unknown> },
  ) {
    if (!alternativeDistrictName) {
      throw new BadGatewayException(
        `Failed to fetch from people API (${endpoint})`,
      )
    }

    const endpointMap = {
      people: '/v1/people',
      search: '/v1/people/search',
      download: '/v1/people/download',
      stats: '/v1/people/stats',
    }

    try {
      if (endpoint === 'download' && options?.body) {
        const body = {
          ...options.body,
          districtName: alternativeDistrictName,
        }
        return await lastValueFrom(
          this.httpService.post(
            `${PEOPLE_API_URL}${endpointMap[endpoint]}`,
            body,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
              ...(options?.responseType && {
                responseType: options.responseType,
              }),
            },
          ),
        )
      }

      const newParams = new URLSearchParams(params)
      newParams.set('districtName', alternativeDistrictName)

      return await lastValueFrom(
        this.httpService.get(
          `${PEOPLE_API_URL}${endpointMap[endpoint]}?${newParams.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            ...(options?.responseType && {
              responseType: options.responseType,
            }),
          },
        ),
      )
    } catch (error) {
      this.logger.error(`Failed to query ${endpoint} from people API`, {
        error,
      })
      throw new BadGatewayException(
        `Failed to fetch from people API (${endpoint})`,
      )
    }
  }

  private async updateCampaignDistrictNameIfSuccessful(
    campaignId: number,
    alternativeDistrictName: string,
    hasResults: boolean,
  ): Promise<void> {
    if (hasResults) {
      await this.campaigns.updateJsonFields(
        campaignId,
        { pathToVictory: { electionLocation: alternativeDistrictName } },
        false,
      )
    }
  }
}
