import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { VoterFileFilter } from '@prisma/client'
import { FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { BallotReadyPositionLevel } from 'src/campaigns/campaigns.types'
import { SHORT_TO_LONG_STATE } from 'src/shared/constants/states'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { SlackChannel } from 'src/vendors/slack/slackService.types'
import { VoterFileFilterService } from 'src/voters/services/voterFileFilter.service'
import {
  CampaignWithPathToVictory,
  DemographicFilter,
  ExtendedVoterFileFilter,
} from '../contacts.types'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from '../schemas/listContacts.schema'
import type { SampleContacts } from '../schemas/sampleContacts.schema'
import { SearchContactsDTO } from '../schemas/searchContacts.schema'
import defaultSegmentToFiltersMap from '../segmentsToFiltersMap.const'
import { transformStatsResponse } from '../stats.transformer'
import { buildTevynApiSlackBlocks } from '../utils/contacts.utils'
import { PollsService } from 'src/polls/services/polls.service'
import dayjs from 'dayjs'
import { cleanL2DistrictName } from 'src/elections/util/clean-district.util'
import { PeopleService } from 'src/people/services/people.service'
import {
  PeopleListResponse,
  PersonListItem,
  PersonOutput,
} from 'src/people/schemas/person.schema'

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

  constructor(
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly peopleService: PeopleService,
    private readonly slack: SlackService,
    private readonly pollsService: PollsService,
  ) {}

  async findContacts(
    dto: ListContactsDTO,
    campaign: CampaignWithPathToVictory,
  ) {
    const { resultsPerPage, page, segment } = dto

    const { state, districtType, districtName, usingStatewideFallback } =
      this.resolveLocationForRequest(campaign)

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

    try {
      const response = await this.peopleService.client.get(
        `/v1/people?${params.toString()}`,
        {
          headers: {
            Authorization: usingStatewideFallback
              ? `Bearer ${this.generateScopedS2SToken(state)}`
              : undefined,
          },
        },
      )
      return this.transformListResponse(response.data)
    } catch (error) {
      this.logger.error(
        'Failed to fetch contacts from people API',
        JSON.stringify(error),
      )
      throw new BadGatewayException('Failed to fetch contacts from people API')
    }
  }

  async searchContacts(
    dto: SearchContactsDTO,
    campaign: CampaignWithPathToVictory,
  ) {
    return this.peopleService.searchPeople(dto, campaign)
  }

  async sampleContacts(
    dto: SampleContacts,
    campaign: CampaignWithPathToVictory,
  ) {
    const locationData = this.extractLocationFromCampaign(campaign)

    const params = new URLSearchParams({
      state: locationData.state,
      districtType: locationData.districtType,
      districtName: locationData.districtName,
      size: String(dto.size ?? 500),
      full: 'true',
    })

    try {
      const response = await this.peopleService.client.get(
        `/v1/people/sample?${params.toString()}`,
      )
      const people = this.normalizePeopleResponse(response.data)
      return people.map((p) => this.peopleService.transformPerson(p))
    } catch (error) {
      this.logger.error('Failed to sample contacts from people API', error)
      throw new BadGatewayException('Failed to sample contacts from people API')
    }
  }

  async findPerson(id: string): Promise<PersonOutput> {
    return this.peopleService.findPerson(id)
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

    const { state, districtType, districtName, usingStatewideFallback } =
      this.resolveLocationForRequest(campaign)

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

    try {
      const response = await this.peopleService.client.get(
        `/v1/people/download?${params.toString()}`,
        {
          headers: {
            Authorization: usingStatewideFallback
              ? `Bearer ${this.generateScopedS2SToken(state)}`
              : undefined,
          },
          responseType: 'stream',
        },
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

  async getDistrictStats(campaign: CampaignWithPathToVictory) {
    const { state, districtType, districtName, usingStatewideFallback } =
      this.resolveLocationForRequest(campaign)

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

    try {
      // keep error-level logging only; avoid leaking token payloads
      const response = await this.peopleService.client.get(
        `/v1/people/stats?${params.toString()}`,
        {
          headers: {
            Authorization: usingStatewideFallback
              ? `Bearer ${this.generateScopedS2SToken(state)}`
              : undefined,
          },
        },
      )
      const transformed = transformStatsResponse(response.data)
      return transformed
    } catch (error) {
      const errStr =
        error instanceof Error
          ? error.stack || error.message
          : JSON.stringify(error)
      this.logger.error('Failed to fetch stats from people API', errStr)
      throw new BadGatewayException('Failed to fetch stats from people API')
    }
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
    usingStatewideFallback: boolean
  } {
    const state = this.getCampaignState(campaign)

    const ptv = campaign.pathToVictory?.data as
      | { electionType?: string; electionLocation?: string }
      | undefined
    const electionType = ptv?.electionType
    const electionLocation = ptv?.electionLocation

    if (electionType && electionLocation) {
      const cleanedName = cleanL2DistrictName(electionLocation)
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
      districtName: cleanL2DistrictName(electionLocation),
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

    // Registered voter
    const rv: Array<boolean> = []
    let rvIncludeNull = false
    if (seg.registeredVoterTrue) rv.push(true)
    if (seg.registeredVoterFalse) rv.push(false)
    if (seg.registeredVoterUnknown) rvIncludeNull = true
    if (rv.length || rvIncludeNull) {
      filter.registeredVoter = {
        ...(rv.length ? { in: rv } : {}),
        ...(rvIncludeNull ? { is: 'null' } : {}),
      }
    }

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
    if (seg.hasChildrenYes) children.push('Yes')
    if (seg.hasChildrenNo) children.push('No')
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
    if (seg.homeownerYes) homeowner.push('Yes Homeowner')
    if (seg.homeownerLikely) homeowner.push('Probable Homeowner')
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
      edu.push('Completed grad school likely')
    }
    if (seg.educationUnknown) eduIncludeNull = true
    if (edu.length || eduIncludeNull) {
      filter.educationOfPerson = {
        ...(edu.length ? { in: edu } : {}),
        ...(eduIncludeNull ? { is: 'null' } : {}),
      }
    }

    // Language codes
    if (seg.languageCodes && seg.languageCodes.length)
      filter.languageCode = { in: seg.languageCodes }

    // Estimated income ranges (vendor domain strings)
    const income: string[] = []
    let incomeIncludeNull = false
    if (seg.incomeRanges && seg.incomeRanges.length) {
      income.push(...seg.incomeRanges)
    }
    if (seg.incomeUnknown) incomeIncludeNull = true
    if (income.length || incomeIncludeNull) {
      filter.estimatedIncomeAmount = {
        ...(income.length ? { in: income } : {}),
        ...(incomeIncludeNull ? { is: 'null' } : {}),
      }
    }

    // Ethnic groups broad categories; Unknown means null
    const eth: string[] = []
    let ethIncludeNull = false
    if (seg.ethnicityAsian) eth.push('East & South Asian')
    if (seg.ethnicityEuropean) eth.push('European')
    if (seg.ethnicityHispanic) eth.push('Hispanic & Portuguese')
    if (seg.ethnicityAfricanAmerican) eth.push('Likely African American')
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
    })
  }

  private transformListResponse(data: PeopleListResponse) {
    return {
      pagination: data.pagination,
      people: data.people.map((p: PersonListItem) =>
        this.peopleService.transformPerson(p),
      ),
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

  async sendTevynApiMessage(
    message: string,
    userInfo: { name?: string; email: string; phone?: string },
    campaign: CampaignWithPathToVictory,
    createPoll: boolean,
    csvFileUrl?: string,
    imageUrl?: string,
  ) {
    let pollId: string | undefined
    if (createPoll) {
      const now = new Date()
      const poll = await this.pollsService.create({
        data: {
          name: 'Top Community Issues',
          status: 'IN_PROGRESS',
          messageContent: message,
          targetAudienceSize: 500,
          scheduledDate: now,
          estimatedCompletionDate: dayjs(now).add(1, 'week').toDate(),
          imageUrl: imageUrl,
          campaignId: campaign.id,
        },
      })
      pollId = poll.id
    }

    const blocks = buildTevynApiSlackBlocks({
      message,
      pollId,
      csvFileUrl,
      imageUrl,
      userInfo,
      campaignSlug: campaign.slug,
    })

    await this.slack.message({ blocks }, SlackChannel.botTevynApi)
  }
}
