import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import axios, { AxiosInstance, isAxiosError } from 'axios'
import jwt from 'jsonwebtoken'
import { BallotReadyPositionLevel } from 'src/campaigns/campaigns.types'
import { SHORT_TO_LONG_STATE } from 'src/shared/constants/states'
import {
  PeopleListResponse,
  PersonInput,
  PersonListItem,
  PersonOutput,
} from '../schemas/person.schema'
import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'
import { CampaignWithPathToVictory } from 'src/contacts/contacts.types'
import { cleanL2DistrictName } from 'src/elections/util/clean-district.util'

const { PEOPLE_API_URL, PEOPLE_API_S2S_SECRET } = process.env

if (!PEOPLE_API_URL) {
  throw new Error('Please set PEOPLE_API_URL in your .env')
}
if (!PEOPLE_API_S2S_SECRET) {
  throw new Error('Please set PEOPLE_API_S2S_SECRET in your .env')
}

const searchPeopleSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    phone: z.string().trim().min(2).max(30).optional(),
    page: z.coerce.number().optional().default(1),
    resultsPerPage: z.coerce
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .default(25),
  })
  .refine(
    (v) => Boolean(v.name || v.phone || v.firstName || v.lastName),
    'Provide name, firstName/lastName, or phone to search',
  )

export class SearchPeopleDTO extends createZodDto(searchPeopleSchema) {}

@Injectable()
export class PeopleService {
  private readonly logger = new Logger(PeopleService.name)

  private cachedToken: string | null = null

  readonly client: AxiosInstance

  constructor() {
    this.client = axios.create({ baseURL: PEOPLE_API_URL })
    this.client.interceptors.request.use((config) => {
      if (!config.headers.Authorization) {
        config.headers.Authorization = `Bearer ${this.getValidS2SToken()}`
      }
      return config
    })
  }

  async searchPeople(
    dto: SearchPeopleDTO,
    campaign: CampaignWithPathToVictory,
  ) {
    const { resultsPerPage, page, name, phone, firstName, lastName } = dto

    if (!campaign.isPro) {
      throw new BadRequestException(
        'Search contacts is only available for pro campaigns',
      )
    }

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
    if (name) params.set('name', name)
    if (firstName) params.set('firstName', firstName)
    if (lastName) params.set('lastName', lastName)
    if (phone) params.set('phone', phone)
    params.set('full', 'true')

    try {
      const response = await this.client.get(
        `/v1/people/search?${params.toString()}`,
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
      this.logger.error('Failed to search contacts from people API', error)
      throw new BadGatewayException('Failed to search contacts from people API')
    }
  }

  async findPerson(id: string): Promise<PersonOutput> {
    try {
      const response = await this.client.get(`/v1/people/${id}`)
      return this.transformPerson(response.data)
    } catch (error) {
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

  private getValidS2SToken(): string {
    if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
      return this.cachedToken
    }
    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iss: 'gp-api',
      iat: now,
      exp: now + 300,
    }
    this.cachedToken = jwt.sign(payload, PEOPLE_API_S2S_SECRET!)
    return this.cachedToken
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

  private transformListResponse(data: PeopleListResponse) {
    return {
      pagination: data.pagination,
      people: data.people.map((p: PersonListItem) => this.transformPerson(p)),
    }
  }

  transformPerson(p: PersonInput): PersonOutput {
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
}
