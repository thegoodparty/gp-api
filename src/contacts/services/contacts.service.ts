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
import { CampaignWithPathToVictory } from '../contacts.types'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from '../schemas/listContacts.schema'
import {
  PeopleListResponse,
  PersonInput,
  PersonListItem,
  PersonOutput,
} from '../schemas/person.schema'
import type { SampleContacts } from '../schemas/sampleContacts.schema'
import { SearchContactsDTO } from '../schemas/searchContacts.schema'
import defaultSegmentToFiltersMap from '../segmentsToFiltersMap.const'
import type { PeopleStats } from '../stats.transformer'
import { transformStatsResponse } from '../stats.transformer'
import {
  convertVoterFileFilterToFilters,
  type FilterObject,
} from '../utils/voterFileFilter.utils'

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
    dto: ListContactsDTO,
    campaign: CampaignWithPathToVictory,
  ) {
    const { resultsPerPage, page, segment } = dto

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
      full: true,
    }

    const token = usingStatewideFallback
      ? this.generateScopedS2SToken(state)
      : this.getValidS2SToken()
    const data = await this.fetchPeopleWithFallbackPost(
      'people',
      body,
      token,
      alternativeDistrictName,
      campaign.id,
    )
    return this.transformListResponse(data)
  }

  async searchContacts(
    dto: SearchContactsDTO,
    campaign: CampaignWithPathToVictory,
  ) {
    const { resultsPerPage, page, name, phone, firstName, lastName } = dto

    if (!campaign.isPro) {
      throw new BadRequestException(
        'Search contacts is only available for pro campaigns',
      )
    }

    const {
      state,
      districtType,
      districtName,
      alternativeDistrictName,
      usingStatewideFallback,
    } = this.resolveLocationForRequest(campaign)

    const params = new URLSearchParams({
      state,
      resultsPerPage: resultsPerPage.toString(),
      page: page.toString(),
    })
    if (districtType && districtName) {
      params.set('districtType', districtType)
      params.set('districtName', districtName)
    }
    if (name) params.set('name', name)
    if (firstName) params.set('firstName', firstName)
    if (lastName) params.set('lastName', lastName)
    if (phone) params.set('phone', phone)
    params.set('full', 'true')
    const token = usingStatewideFallback
      ? this.generateScopedS2SToken(state)
      : this.getValidS2SToken()
    const data = await this.fetchPeopleWithFallback(
      'search',
      params,
      token,
      alternativeDistrictName,
      campaign.id,
    )
    return this.transformListResponse(data)
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
      return people.map((p) => this.transformPerson(p))
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
      const response = await lastValueFrom(
        this.httpService.get(`${PEOPLE_API_URL}/v1/people/${id}`, {
          headers: {
            Authorization: `Bearer ${this.getValidS2SToken()}`,
          },
        }),
      )
      const person = response.data as PersonInput &
        Record<string, string | number | boolean | null | undefined>

      const {
        state,
        districtType,
        districtName,
        alternativeDistrictName,
        usingStatewideFallback,
      } = this.resolveLocationForRequest(campaign)

      const personState = String(
        person.Residence_Addresses_State || '',
      ).toUpperCase()
      const stateMatches = personState === state.toUpperCase()

      if (usingStatewideFallback) {
        if (!stateMatches) throw new NotFoundException('Person not found')
        return this.transformPerson(person)
      }

      if (!districtType || !districtName) {
        throw new BadRequestException(
          'Campaign path to victory data is missing required election information',
        )
      }

      const rawDistrictValue = person[districtType]
      const districtValue =
        typeof rawDistrictValue === 'string' ? rawDistrictValue : ''
      const cleanedPersonDistrict =
        this.elections.cleanDistrictName(districtValue)
      const personMatches =
        cleanedPersonDistrict === districtName ||
        cleanedPersonDistrict === `${districtName} (EST.)` ||
        (alternativeDistrictName
          ? cleanedPersonDistrict === alternativeDistrictName
          : false)

      if (!stateMatches || !personMatches)
        throw new NotFoundException('Person not found')
      return this.transformPerson(person)
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
          { responseType: 'stream' },
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

  async getDistrictStats(
    campaign: CampaignWithPathToVictory,
    hasCellPhone = false,
  ) {
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
    const details = campaign.details as { electionDate?: string } | undefined
    const electionYear = details?.electionDate
      ? Number(String(details.electionDate).slice(0, 4))
      : undefined
    if (typeof electionYear === 'number' && Number.isFinite(electionYear))
      params.set('electionYear', String(electionYear))
    if (hasCellPhone) {
      params.append('filters[]', 'hasCellPhone')
    }
    const token = usingStatewideFallback
      ? this.generateScopedS2SToken(state)
      : this.getValidS2SToken()
    const data = await this.fetchStatsWithFallback(
      params,
      token,
      alternativeDistrictName,
    )
    return transformStatsResponse(data)
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
      throw new BadRequestException('Campaign details are missing')
    }
    const { state } = campaign.details as { state?: string }
    if (!state || state.length !== 2) {
      throw new BadRequestException('Invalid state code in campaign data')
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

    throw new BadRequestException(
      'Campaign path to victory data is missing required election information',
    )
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
      throw new BadRequestException(
        'Campaign path to victory data is missing required election information',
      )
    }

    if (!campaign.details) {
      throw new BadRequestException('Campaign details are missing')
    }

    const { state } = campaign.details as { state?: string }

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

  private transformListResponse(data: PeopleListResponse) {
    return {
      pagination: data.pagination,
      people: data.people.map((p: PersonListItem) => this.transformPerson(p)),
    }
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

  private transformPerson(p: PersonInput): PersonOutput {
    const firstName = p.FirstName || ''
    const lastName = p.LastName || ''
    const gender =
      p.Gender === 'M' ? 'Male' : p.Gender === 'F' ? 'Female' : 'Unknown'
    const age =
      typeof p.Age_Int === 'number' && Number.isFinite(p.Age_Int)
        ? p.Age_Int
        : p.Age && Number.isFinite(parseInt(p.Age, 10))
          ? parseInt(p.Age, 10)
          : 'Unknown'
    const politicalParty = p.Parties_Description || 'Unknown'
    const registeredVoter =
      p.Registered_Voter === true
        ? 'Yes'
        : p.Registered_Voter === false
          ? 'No'
          : 'Unknown'
    const activeVoter = 'Unknown'
    const voterStatus = p.Voter_Status || 'Unknown'
    const zipPlus4 = p.Residence_Addresses_ZipPlus4
      ? `-${p.Residence_Addresses_ZipPlus4}`
      : ''
    const addressParts = [
      p.Residence_Addresses_AddressLine,
      [p.Residence_Addresses_City, p.Residence_Addresses_State]
        .filter((v) => Boolean(v))
        .join(', '),
      [p.Residence_Addresses_Zip, zipPlus4].filter((v) => Boolean(v)).join(''),
    ].filter((v) => Boolean(v))
    const address = addressParts.length ? addressParts.join(', ') : 'Unknown'
    const cellPhone = p.VoterTelephones_CellPhoneFormatted || 'Unknown'
    const landline = p.VoterTelephones_LandlineFormatted || 'Unknown'
    const maritalStatus = this.mapMaritalStatus(p.Marital_Status)
    const hasChildrenUnder18 = this.mapPresenceOfChildren(
      p.Presence_Of_Children,
    )
    const veteranStatus = p.Veteran_Status === 'Yes' ? 'Yes' : 'Unknown'
    const homeowner = this.mapHomeowner(p.Homeowner_Probability_Model)
    const businessOwner =
      p.Business_Owner && p.Business_Owner.toLowerCase().includes('owner')
        ? 'Yes'
        : 'Unknown'
    const levelOfEducation = this.mapEducation(p.Education_Of_Person)
    const ethnicityGroup = this.mapEthnicity(p.EthnicGroups_EthnicGroup1Desc)
    const language = p.Language_Code ? p.Language_Code : 'Unknown'
    const estimatedIncomeRange = p.Estimated_Income_Amount || 'Unknown'
    const lat = p.Residence_Addresses_Latitude || null
    const lng = p.Residence_Addresses_Longitude || null
    return {
      id: p.id,
      firstName,
      lastName,
      gender,
      age,
      politicalParty,
      registeredVoter,
      activeVoter,
      voterStatus,
      address,
      cellPhone,
      landline,
      maritalStatus,
      hasChildrenUnder18,
      veteranStatus,
      homeowner,
      businessOwner,
      levelOfEducation,
      ethnicityGroup,
      language,
      estimatedIncomeRange,
      lat,
      lng,
    }
  }

  private mapMaritalStatus(
    value: string | null | undefined,
  ): 'Likely Married' | 'Likely Single' | 'Married' | 'Single' | 'Unknown' {
    if (!value) return 'Unknown'
    const v = value.toLowerCase()
    if (v.includes('inferred married')) return 'Likely Married'
    if (v.includes('inferred single')) return 'Likely Single'
    if (v === 'married') return 'Married'
    if (v === 'single') return 'Single'
    return 'Unknown'
  }

  private mapPresenceOfChildren(
    value: string | null | undefined,
  ): 'Yes' | 'No' | 'Unknown' {
    if (!value) return 'Unknown'
    const v = value.toLowerCase()
    if (v === 'y' || v === 'yes') return 'Yes'
    if (v === 'n' || v === 'no') return 'No'
    return 'Unknown'
  }

  private mapHomeowner(
    value: string | null | undefined,
  ): 'Yes' | 'Likely' | 'No' | 'Unknown' {
    if (!value) return 'Unknown'
    const v = value.toLowerCase()
    if (v.includes('home owner') || v.includes('yes homeowner')) return 'Yes'
    if (v.includes('probable homeowner')) return 'Likely'
    if (v.includes('renter')) return 'No'
    return 'Unknown'
  }

  private mapEducation(
    value: string | null | undefined,
  ):
    | 'None'
    | 'High School Diploma'
    | 'Technical School'
    | 'Some College'
    | 'College Degree'
    | 'Graduate Degree'
    | 'Unknown' {
    if (!value) return 'Unknown'
    const v = value.toLowerCase()
    if (v.includes('did not complete high school')) return 'None'
    if (v.includes('completed high school')) return 'High School Diploma'
    if (v.includes('vocational') || v.includes('technical school'))
      return 'Technical School'
    if (v.includes('did not complete college')) return 'Some College'
    if (v.includes('completed college')) return 'College Degree'
    if (v.includes('completed grad school') || v.includes('graduate'))
      return 'Graduate Degree'
    return 'Unknown'
  }

  private mapEthnicity(
    value: string | null | undefined,
  ):
    | 'Asian'
    | 'European'
    | 'Hispanic'
    | 'African American'
    | 'Other'
    | 'Unknown' {
    if (!value) return 'Unknown'
    const v = value.toLowerCase()
    if (
      v.includes('east & south asian') ||
      v.includes('east and south asian') ||
      v.includes('asian')
    )
      return 'Asian'
    if (v.includes('european')) return 'European'
    if (
      v.includes('hispanic & portuguese') ||
      v.includes('hispanic and portuguese') ||
      v.includes('hispanic')
    )
      return 'Hispanic'
    if (v.includes('likely african american') || v.includes('african american'))
      return 'African American'
    if (v.includes('other')) return 'Other'
    return 'Unknown'
  }

  private async queryAlternativeDistrictName(
    params: URLSearchParams,
    token: string,
    endpoint: 'people' | 'search' | 'download' | 'stats',
    alternativeDistrictName?: string,
    options?: { responseType?: 'stream' },
  ) {
    if (!alternativeDistrictName) {
      throw new BadGatewayException(
        `Failed to fetch from people API (${endpoint})`,
      )
    }

    const newParams = new URLSearchParams(params)
    newParams.set('districtName', alternativeDistrictName)

    const endpointMap = {
      people: '/v1/people',
      search: '/v1/people/search',
      download: '/v1/people/download',
      stats: '/v1/people/stats',
    }

    try {
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

  private async fetchPeopleWithFallbackPost(
    endpoint: 'people' | 'search',
    body: Record<string, unknown>,
    token: string,
    alternativeDistrictName?: string,
    campaignId?: number,
  ): Promise<PeopleListResponse> {
    try {
      const response = await lastValueFrom(
        this.httpService.post(
          `${PEOPLE_API_URL}/v1/people${
            endpoint === 'people' ? '' : '/search'
          }`,
          body,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      )
      if (
        response.data.pagination?.totalResults <= 0 &&
        alternativeDistrictName
      ) {
        const alternativeBody = {
          ...body,
          districtName: alternativeDistrictName,
        }
        const alternativeResponse = await lastValueFrom(
          this.httpService.post(
            `${PEOPLE_API_URL}/v1/people${
              endpoint === 'people' ? '' : '/search'
            }`,
            alternativeBody,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          ),
        )
        const altData = alternativeResponse.data as PeopleListResponse
        if (campaignId && alternativeDistrictName) {
          await this.updateCampaignDistrictNameIfSuccessful(
            campaignId,
            alternativeDistrictName,
            altData.pagination.totalResults > 0,
          )
        }
        return altData
      }
      return response.data as PeopleListResponse
    } catch (error) {
      this.logger.error(`Failed to fetch from people API (${endpoint})`, {
        error,
      })
      throw new BadGatewayException(
        `Failed to fetch from people API (${endpoint})`,
      )
    }
  }

  private async fetchPeopleWithFallback(
    endpoint: 'people' | 'search',
    params: URLSearchParams,
    token: string,
    alternativeDistrictName?: string,
    campaignId?: number,
  ): Promise<PeopleListResponse> {
    try {
      const response = await lastValueFrom(
        this.httpService.get(
          `${PEOPLE_API_URL}/v1/people${
            endpoint === 'people' ? '' : '/search'
          }?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      )
      if (
        response.data.pagination?.totalResults <= 0 &&
        alternativeDistrictName
      ) {
        const alternativeResponse = await this.queryAlternativeDistrictName(
          params,
          token,
          endpoint,
          alternativeDistrictName,
        )
        const altData = alternativeResponse.data as PeopleListResponse
        if (campaignId && alternativeDistrictName) {
          await this.updateCampaignDistrictNameIfSuccessful(
            campaignId,
            alternativeDistrictName,
            (altData.pagination?.totalResults || 0) > 0,
          )
        }
        return altData
      }
      return response.data as PeopleListResponse
    } catch (error) {
      this.logger.error(`Failed to fetch  from people API`, { endpoint, error })
      if (alternativeDistrictName) {
        const alternativeResponse = await this.queryAlternativeDistrictName(
          params,
          token,
          endpoint,
          alternativeDistrictName,
        )
        const altData = alternativeResponse.data as PeopleListResponse
        if (campaignId && alternativeDistrictName) {
          await this.updateCampaignDistrictNameIfSuccessful(
            campaignId,
            alternativeDistrictName,
            (altData.pagination?.totalResults || 0) > 0,
          )
        }
        return altData
      }
      throw new BadGatewayException(
        `Failed to fetch from people API (${endpoint})`,
      )
    }
  }

  private async fetchStatsWithFallback(
    params: URLSearchParams,
    token: string,
    alternativeDistrictName?: string,
  ): Promise<PeopleStats> {
    try {
      const response = await lastValueFrom(
        this.httpService.get(
          `${PEOPLE_API_URL}/v1/people/stats?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      )
      if (response.data.totalVoters <= 0 && alternativeDistrictName) {
        const alternativeResponse = await this.queryAlternativeDistrictName(
          params,
          token,
          'stats',
          alternativeDistrictName,
        )
        return alternativeResponse.data as PeopleStats
      }
      return response.data as PeopleStats
    } catch (error) {
      this.logger.error('Failed to fetch stats from people API', { error })
      if (alternativeDistrictName) {
        const alternativeResponse = await this.queryAlternativeDistrictName(
          params,
          token,
          'stats',
          alternativeDistrictName,
        )
        return alternativeResponse.data as PeopleStats
      }
      throw new BadGatewayException('Failed to fetch stats from people API')
    }
  }
}
