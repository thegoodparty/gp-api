import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common'
import { VoterFileFilter } from '@prisma/client'
import { FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { lastValueFrom } from 'rxjs'
import { ElectionsService } from 'src/elections/services/elections.service'
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
import defaultSegmentToFiltersMap from './segmentsToFiltersMap.const'

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

    const locationData = this.extractLocationFromCampaign(campaign)

    const params = new URLSearchParams({
      state: locationData.state,
      districtType: locationData.districtType,
      districtName: locationData.districtName,
      resultsPerPage: resultsPerPage.toString(),
      page: page.toString(),
    })

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
      const token = this.getValidS2SToken()
      const response = await lastValueFrom(
        this.httpService.get(
          `${PEOPLE_API_URL}/v1/people?${params.toString()}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          },
        ),
      )
      return this.transformListResponse(response.data)
    } catch (error: unknown) {
      this.logger.error('Failed to fetch contacts from people API', error)
      throw new BadGatewayException('Failed to fetch contacts from people API')
    }
  }

  async findPerson(id: string) {
    return (
      await lastValueFrom(
        this.httpService.get(`${PEOPLE_API_URL}/v1/people/${id}`, {
          headers: {
            Authorization: `Bearer ${this.getValidS2SToken()}`,
          },
        }),
      )
    ).data
  }

  async downloadContacts(
    dto: DownloadContactsDTO,
    campaign: CampaignWithPathToVictory,
    res: FastifyReply,
  ) {
    const segment = dto.segment as string | undefined

    const locationData = this.extractLocationFromCampaign(campaign)

    const params = new URLSearchParams({
      state: locationData.state,
      districtType: locationData.districtType,
      districtName: locationData.districtName,
    })

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
    } catch (error: unknown) {
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

  private transformListResponse(data: {
    pagination: {
      totalResults: number
      currentPage: number
      pageSize: number
      totalPages: number
      hasNextPage: boolean
      hasPreviousPage: boolean
    }
    people: Array<{
      LALVOTERID?: string
      State?: string | null
      FirstName?: string | null
      MiddleName?: string | null
      LastName?: string | null
      NameSuffix?: string | null
      Residence_Addresses_AddressLine?: string | null
      Residence_Addresses_ExtraAddressLine?: string | null
      Residence_Addresses_City?: string | null
      Residence_Addresses_State?: string | null
      Residence_Addresses_Zip?: string | null
      Residence_Addresses_ZipPlus4?: string | null
      VoterTelephones_LandlineFormatted?: string | null
      VoterTelephones_CellPhoneFormatted?: string | null
      Age?: string | null
      Gender?: string | null
      Parties_Description?: string | null
      County?: string | null
      City?: string | null
      Precinct?: string | null
      Business_Owner?: string | null
      Education_Of_Person?: string | null
      Estimated_Income_Amount?: string | null
      Homeowner_Probability_Model?: string | null
      Language_Code?: string | null
      Marital_Status?: string | null
      Presence_Of_Children?: string | null
      Registered_Voter?: boolean | null
      Veteran_Status?: string | null
      Voter_Status?: string | null
      EthnicGroups_EthnicGroup1Desc?: string | null
      Age_Int?: number | null
    }>
  }) {
    return {
      pagination: data.pagination,
      people: data.people.map((p) => this.transformPerson(p)),
    }
  }

  private transformPerson(p: {
    FirstName?: string | null
    LastName?: string | null
    Gender?: string | null
    Age?: string | null
    Age_Int?: number | null
    Parties_Description?: string | null
    Registered_Voter?: boolean | null
    Voter_Status?: string | null
    Residence_Addresses_AddressLine?: string | null
    Residence_Addresses_City?: string | null
    Residence_Addresses_State?: string | null
    Residence_Addresses_Zip?: string | null
    Residence_Addresses_ZipPlus4?: string | null
    VoterTelephones_CellPhoneFormatted?: string | null
    VoterTelephones_LandlineFormatted?: string | null
    Marital_Status?: string | null
    Presence_Of_Children?: string | null
    Veteran_Status?: string | null
    Homeowner_Probability_Model?: string | null
    Business_Owner?: string | null
    Education_Of_Person?: string | null
    EthnicGroups_EthnicGroup1Desc?: string | null
    Language_Code?: string | null
    Estimated_Income_Amount?: string | null
  }) {
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

    return {
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
}
