import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { VoterFileFilter } from '@prisma/client'
import { isAxiosError } from 'axios'
import { FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { lastValueFrom } from 'rxjs'
import { BallotReadyPositionLevel } from 'src/campaigns/campaigns.types'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ElectionsService } from 'src/elections/services/elections.service'
import { INCOME_RANGE_MAP } from 'src/shared/constants/incomeRanges'
import { SHORT_TO_LONG_STATE } from 'src/shared/constants/states'
import { VoterFileFilterService } from 'src/voters/services/voterFileFilter.service'
import {
  CampaignWithPathToVictory,
  DemographicFilter,
  ExtendedVoterFileFilter,
  NumericRange,
} from '../contacts.types'
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

const { PEOPLE_API_URL, PEOPLE_API_S2S_SECRET } = process.env

if (!PEOPLE_API_URL) {
  throw new Error('Please set PEOPLE_API_URL in your .env')
}
if (!PEOPLE_API_S2S_SECRET) {
  throw new Error('Please set PEOPLE_API_S2S_SECRET in your .env')
}

// This list was collected by examining the language values in the people-db in production
// on Oct 27 2025.
const OTHER_LANGUAGES = [
  'Bantu',
  'Afrikaans',
  'Turkmeni',
  'Swazi',
  'Sotho',
  'Malagasy',
  'Kirghiz',
  'Tajik',
  'Xhosa',
  'Samoan',
  'Moldavian',
  'Malay',
  'Tswana',
  'Macedonian',
  'Bengali',
  'Somali',
  'Uzbeki',
  'Tongan',
  'Kazakh',
  'Azeri',
  'Mongolian',
  'Zulu',
  'Icelandic',
  'Georgian',
  'Nepali',
  'Basque',
  'Indonesian',
  'Estonian',
  'Dzongha',
  'Slovakian',
  'Pashto',
  'Sinhalese',
  'Swahili',
  'Tibetan',
  'Ashanti',
  'Oromo',
  'Burmese',
  'Lithuanian',
  'Latvian',
  'Laotian',
  'Albanian',
  'Finnish',
  'Slovenian',
  'Czech',
  'Ga',
  'Khmer',
  'Norwegian',
  'Dutch',
  'Danish',
  'Bulgarian',
  'Turkish',
  'Thai',
  'Serbo-Croatian',
  'Swedish',
  'Armenian',
  'Urdu',
  'Romanian',
  'Tagalog',
  'Amharic',
  'Hungarian',
  'Greek',
  'French',
  'Farsi',
  'Japanese',
  'German',
  'Russian',
  'Polish',
  'Hebrew',
  'Korean',
  'Italian',
  'Arabic',
  'Hindi',
  'Portuguese',
  'Vietnamese',
  'Chinese',
]

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

    const params = new URLSearchParams({
      state,
      resultsPerPage: resultsPerPage.toString(),
      page: page.toString(),
    })
    if (districtType && districtName) {
      params.set('districtType', districtType)
      params.set('districtName', districtName)
    }

    // Build demographic filter from full segment when custom segment id is used
    const demographicFilter = await this.buildDemographicFilterFromSegmentId(
      segment,
      campaign,
    )
    this.appendDemographicFilter(params, demographicFilter)
    const listFilters = await this.segmentToFilters(segment, campaign)
    listFilters.forEach((f) => params.append('filters[]', f))
    params.set('full', 'true')
    const token = usingStatewideFallback
      ? this.generateScopedS2SToken(state)
      : this.getValidS2SToken()
    const data = await this.fetchPeopleWithFallback(
      'people',
      params,
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

    // Build demographic filter from full segment when custom segment id is used
    const demographicFilter = await this.buildDemographicFilterFromSegmentId(
      segment,
      campaign,
    )
    this.appendDemographicFilter(params, demographicFilter)
    const listFilters = await this.segmentToFilters(segment, campaign)
    listFilters.forEach((f) => params.append('filters[]', f))
    params.set('full', 'true')
    let token: string | undefined
    try {
      token = usingStatewideFallback
        ? this.generateScopedS2SToken(state)
        : this.getValidS2SToken()
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
      params.append('filters[]', 'cellPhoneFormatted')
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

  private convertVoterFileFilterToFilters(
    segment: ExtendedVoterFileFilter,
  ): string[] {
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
    if (segment.audienceUnreliableVoters)
      filters.push('audienceUnreliableVoters')
    if (segment.audienceUnlikelyVoters) filters.push('audienceUnlikelyVoters')
    if (segment.audienceUnknown) filters.push('audienceUnknown')

    if (segment.hasCellPhone) filters.push('cellPhoneFormatted')
    if (segment.hasLandline) filters.push('landlineFormatted')

    return filters
  }

  private async buildDemographicFilterFromSegmentId(
    segment: string | undefined,
    campaign: CampaignWithPathToVictory,
  ): Promise<DemographicFilter> {
    // If segment is a known default, no demographic filter additions are applied
    if (!segment || this.isDefaultSegment(segment)) return {}

    const id = parseInt(segment)
    if (!Number.isFinite(id)) return {}

    const fullSegment = await this.voterFileFilterService.findByIdAndCampaignId(
      id,
      campaign.id,
    )
    if (!fullSegment) return {}

    return this.translateSegmentToDemographicFilter(fullSegment)
  }

  private isDefaultSegment(segment: string): boolean {
    return Boolean(
      defaultSegmentToFiltersMap[
        segment as keyof typeof defaultSegmentToFiltersMap
      ],
    )
  }

  private translateSegmentToDemographicFilter(
    s: VoterFileFilter,
  ): DemographicFilter {
    const seg = s as ExtendedVoterFileFilter
    const filter: DemographicFilter = {}

    // Voter status
    if (seg.voterStatus && seg.voterStatus.length)
      filter.voterStatus = { in: seg.voterStatus }

    // Marital status booleans → vendor domain strings; Unknown means null
    const marital: string[] = []
    let maritalIncludeNull = false
    if (seg.likelyMarried) marital.push('Inferred Married')
    if (seg.likelySingle) marital.push('Inferred Single')
    if (seg.married) marital.push('Married')
    if (seg.single) marital.push('Single')
    if (seg.maritalUnknown) maritalIncludeNull = true
    if (marital.length || maritalIncludeNull) {
      filter.maritalStatus = {
        ...(marital.length ? { in: marital } : {}),
        ...(maritalIncludeNull ? { is: 'null' } : {}),
      }
    }

    // Presence of children; Unknown means null
    const children: string[] = []
    let childrenIncludeNull = false
    if (seg.hasChildrenYes) children.push('Y')
    if (seg.hasChildrenNo) children.push('N')
    if (seg.hasChildrenUnknown) childrenIncludeNull = true
    if (children.length || childrenIncludeNull) {
      filter.presenceOfChildren = {
        ...(children.length ? { in: children } : {}),
        ...(childrenIncludeNull ? { is: 'null' } : {}),
      }
    }

    // Veteran status; Unknown means null
    const veteran: string[] = []
    let veteranIncludeNull = false
    if (seg.veteranYes) veteran.push('Yes')
    if (seg.veteranUnknown) veteranIncludeNull = true
    if (veteran.length || veteranIncludeNull) {
      filter.veteranStatus = {
        ...(veteran.length ? { in: veteran } : {}),
        ...(veteranIncludeNull ? { is: 'null' } : {}),
      }
    }

    // Homeowner probability model; Unknown means null
    const homeowner: string[] = []
    let homeownerIncludeNull = false
    if (seg.homeownerYes) homeowner.push('Home Owner')
    if (seg.homeownerLikely) homeowner.push('Probable Home Owner')
    if (seg.homeownerNo) homeowner.push('Renter')
    if (seg.homeownerUnknown) homeownerIncludeNull = true
    if (homeowner.length || homeownerIncludeNull) {
      filter.homeownerProbabilityModel = {
        ...(homeowner.length ? { in: homeowner } : {}),
        ...(homeownerIncludeNull ? { is: 'null' } : {}),
      }
    }

    // Business owner in household; Unknown means null
    const biz: string[] = []
    let bizIncludeNull = false
    if (seg.businessOwnerYes) biz.push('Yes')
    if (seg.businessOwnerUnknown) bizIncludeNull = true
    if (biz.length || bizIncludeNull) {
      filter.businessOwner = {
        ...(biz.length ? { in: biz } : {}),
        ...(bizIncludeNull ? { is: 'null' } : {}),
      }
    }

    // Education levels; Unknown means null
    const edu: string[] = []
    let eduIncludeNull = false
    if (seg.educationNone) edu.push('Did not complete high school likely')
    if (seg.educationHighSchoolDiploma) {
      edu.push('Completed high school likely')
    }
    if (seg.educationTechnicalSchool) {
      edu.push('Attended vocational/technical school likely')
    }
    if (seg.educationSomeCollege) {
      edu.push('Attended but did not complete college likely')
    }
    if (seg.educationCollegeDegree) {
      edu.push('Completed college likely')
    }
    if (seg.educationGraduateDegree) {
      edu.push('Completed graduate school likely')
    }
    if (seg.educationUnknown) eduIncludeNull = true
    if (edu.length || eduIncludeNull) {
      filter.educationOfPerson = {
        ...(edu.length ? { in: edu } : {}),
        ...(eduIncludeNull ? { is: 'null' } : {}),
      }
    }

    // Language codes
    if (seg.languageCodes.length) {
      filter.languageCode = {
        in: seg.languageCodes
          .flatMap((code) => {
            if (code === 'es') {
              return 'Spanish'
            }
            if (code === 'en') {
              return 'English'
            }
            if (code === 'other') {
              return OTHER_LANGUAGES
            }
            // Ignore any other values for now.
            return ''
          })
          .filter(Boolean),
        is: seg.languageCodes.includes('other') ? 'null' : undefined,
      }
    }

    // Estimated income ranges - parse labels to numeric min/max
    const incomeIncludeNull = seg.incomeUnknown === true
    let incomeRangeFilter:
      | { gte: number; lt?: number }
      | { orRanges: NumericRange[] }
      | null = null

    if (seg.incomeRanges && seg.incomeRanges.length) {
      const parsedRanges: Array<{ min: number; max: number | null }> = []
      for (const label of seg.incomeRanges) {
        const parsed = this.parseIncomeRangeLabel(label)
        if (!parsed) {
          throw new BadRequestException(`Invalid income range label: ${label}`)
        }
        parsedRanges.push(parsed)
      }

      const coalescedRanges = this.coalesceContiguousRanges(parsedRanges)

      if (coalescedRanges.length === 1) {
        incomeRangeFilter = coalescedRanges[0]
      } else if (coalescedRanges.length > 1) {
        incomeRangeFilter = { orRanges: coalescedRanges }
      }
    }

    if (incomeRangeFilter || incomeIncludeNull) {
      filter.estimatedIncomeAmountInt = {
        ...(incomeRangeFilter || {}),
        ...(incomeIncludeNull ? { is: 'null' } : {}),
      }
    }

    // Ethnic groups broad categories; Unknown means null
    const eth: string[] = []
    let ethIncludeNull = false
    if (seg.ethnicityAsian) eth.push('East and South Asian')
    if (seg.ethnicityEuropean) eth.push('European')
    if (seg.ethnicityHispanic) eth.push('Hispanic and Portuguese')
    if (seg.ethnicityAfricanAmerican) eth.push('Likely African-American')
    if (seg.ethnicityOther) eth.push('Other')
    if (seg.ethnicityUnknown) ethIncludeNull = true
    if (eth.length || ethIncludeNull) {
      filter.ethnicGroupsEthnicGroup1Desc = {
        ...(eth.length ? { in: eth } : {}),
        ...(ethIncludeNull ? { is: 'null' } : {}),
      }
    }

    return filter
  }

  private appendDemographicFilter(
    params: URLSearchParams,
    demographicFilter: DemographicFilter,
  ): void {
    Object.entries(demographicFilter).forEach(([apiField, ops]) => {
      if (!ops || typeof ops !== 'object') return
      if (ops.eq !== undefined)
        params.append(`filter[${apiField}][eq]`, String(ops.eq))
      if (ops.is === 'null' || ops.is === 'not_null')
        params.append(`filter[${apiField}][is]`, String(ops.is))
      if (ops.in !== undefined) {
        const values = Array.isArray(ops.in) ? ops.in : [ops.in]
        values.forEach((v) =>
          params.append(`filter[${apiField}][in][]`, String(v)),
        )
      }
      if (ops.gte !== undefined)
        params.append(`filter[${apiField}][gte]`, String(ops.gte))
      if (ops.lt !== undefined)
        params.append(`filter[${apiField}][lt]`, String(ops.lt))
      if (ops.orRanges !== undefined && Array.isArray(ops.orRanges)) {
        ops.orRanges.forEach((range, idx) => {
          if (range.gte !== undefined)
            params.append(
              `filter[${apiField}][orRanges][${idx}][gte]`,
              String(range.gte),
            )
          if (range.lt !== undefined)
            params.append(
              `filter[${apiField}][orRanges][${idx}][lt]`,
              String(range.lt),
            )
        })
      }
    })
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

  private parseIncomeRangeLabel(
    label: string,
  ): { min: number; max: number | null } | null {
    const range = INCOME_RANGE_MAP[label]
    if (!range) return null
    if (range.max !== null && range.min >= range.max) {
      throw new Error(
        `Invalid income range config: min (${range.min}) must be less than max (${range.max})`,
      )
    }
    return range
  }

  private coalesceContiguousRanges(
    ranges: Array<{ min: number; max: number | null }>,
  ): NumericRange[] {
    if (ranges.length === 0) return []

    const sorted = [...ranges].sort((a, b) => a.min - b.min)

    const result: NumericRange[] = []
    let current = { gte: sorted[0].min, lt: sorted[0].max }

    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i]
      if (current.lt !== null && current.lt === next.min) {
        current.lt = next.max
      } else {
        result.push(
          current.lt !== null
            ? { gte: current.gte, lt: current.lt }
            : { gte: current.gte },
        )
        current = { gte: next.min, lt: next.max }
      }
    }

    result.push(
      current.lt !== null
        ? { gte: current.gte, lt: current.lt }
        : { gte: current.gte },
    )

    return result
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
