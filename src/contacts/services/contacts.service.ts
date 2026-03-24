import { BallotReadyPositionLevel } from '@goodparty_org/contracts'
import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Organization } from '@prisma/client'
import { isAxiosError } from 'axios'
import { FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { PinoLogger } from 'nestjs-pino'
import { Readable } from 'node:stream'
import { lastValueFrom } from 'rxjs'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { ElectionsService } from 'src/elections/services/elections.service'
import { SHORT_TO_LONG_STATE } from 'src/shared/constants/states'
import { VoterFileFilterService } from 'src/voters/services/voterFileFilter.service'
import { CampaignWithPathToVictory, StatsResponse } from '../contacts.types'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from '../schemas/listContacts.schema'
import { PeopleListResponse, PersonOutput } from '../schemas/person.schema'
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
  private cachedToken: string | null = null

  constructor(
    private readonly httpService: HttpService,
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly elections: ElectionsService,
    private readonly campaigns: CampaignsService,
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ContactsService.name)
  }

  async withFallbackDistrictName<Result>(
    campaign: CampaignWithPathToVictory,
    fn: (params: {
      state: string
      districtType?: string
      districtName?: string
    }) => Promise<Result>,
  ): Promise<Result> {
    const { state, districtType, districtName, alternativeDistrictName } =
      this.resolveLocationForRequest(campaign)

    try {
      return await fn({ state, districtType, districtName })
    } catch (error) {
      const is404 = isAxiosError(error) && error.response?.status === 404
      if (!alternativeDistrictName || !is404) {
        throw error
      }
      const result = await fn({
        state,
        districtType,
        districtName: alternativeDistrictName,
      })
      await this.campaigns.updateJsonFields(
        campaign.id,
        { pathToVictory: { electionLocation: alternativeDistrictName } },
        false,
      )
      return result
    }
  }

  private async hasElectedOfficeAccess(
    userId: number,
    organization?: Organization,
  ): Promise<boolean> {
    if (organization) {
      // Org path: check if this organization has an elected office
      const eo = await this.electedOfficeService.findFirst({
        where: { organizationSlug: organization.slug, isActive: true },
      })
      return eo !== null
    }
    // Legacy: check by userId + isActive
    const eo = await this.electedOfficeService.getCurrentElectedOffice(userId)
    return eo !== null
  }

  private async resolveDistrictIdFromOrg(
    org: Organization,
  ): Promise<string | null> {
    if (org.overrideDistrictId) {
      return org.overrideDistrictId
    }

    if (org.positionId) {
      const position = await this.elections.getPositionById(org.positionId, {
        includeDistrict: true,
      })
      return position?.district?.id ?? null
    }

    return null
  }

  private async withOrgDistrictResolution<Result>(
    org: Organization,
    campaign: CampaignWithPathToVictory,
    fn: (params: { districtId?: string; state?: string }) => Promise<Result>,
  ): Promise<Result> {
    const districtId = await this.resolveDistrictIdFromOrg(org)

    if (districtId) {
      return fn({ districtId })
    }

    // No district on the org (statewide/federal case).
    if (!this.canUseStatewideFallback(campaign)) {
      throw new BadRequestException(
        'Statewide or federal contacts require admin approval',
      )
    }
    const state = this.getCampaignState(campaign)
    return fn({ state })
  }

  async findContacts(
    { resultsPerPage, page, search, segment }: ListContactsDTO,
    campaign: CampaignWithPathToVictory,
    organization?: Organization,
  ) {
    if (search) {
      const hasElectedOffice = await this.hasElectedOfficeAccess(
        campaign.userId,
        organization,
      )
      if (!campaign.isPro && !hasElectedOffice) {
        throw new BadRequestException(
          'Search is only available for pro campaigns',
        )
      }
    }
    const filters = await this.segmentToFilters(segment, campaign)

    const fetchPeople = async (districtParams: {
      districtId?: string
      state?: string
      districtType?: string
      districtName?: string
    }) => {
      try {
        const response = await lastValueFrom(
          this.httpService.post(
            `${PEOPLE_API_URL}/v1/people`,
            {
              ...districtParams,
              resultsPerPage,
              page,
              filters,
              search,
            },
            {
              headers: { Authorization: `Bearer ${this.getValidS2SToken()}` },
            },
          ),
        )
        // People API response is untyped — external API returns unknown response shape
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        return response.data as PeopleListResponse
      } catch (error) {
        this.logger.error(
          {
            error,
          },
          `Failed to fetch from people API`,
        )
        throw new BadGatewayException(`Failed to fetch from people API`)
      }
    }

    if (organization) {
      return this.withOrgDistrictResolution(organization, campaign, fetchPeople)
    }

    return this.withFallbackDistrictName(campaign, fetchPeople)
  }

  async sampleContacts(
    dto: SampleContacts,
    campaign: CampaignWithPathToVictory,
  ) {
    return this.withFallbackDistrictName(
      campaign,
      async ({ state, districtType, districtName }) => {
        const body = {
          state,
          districtType,
          districtName,
          size: String(dto.size ?? 500),
          hasCellPhone: 'true',
          excludeIds: (dto.excludeIds ?? []) as string[],
        }

        try {
          const token = this.getValidS2SToken()
          const response = await lastValueFrom(
            this.httpService.post<PersonOutput[]>(
              `${PEOPLE_API_URL}/v1/people/sample`,
              body,
              {
                headers: {
                  Authorization: `Bearer ${token}`,
                },
              },
            ),
          )
          return response.data
        } catch (error) {
          this.logger.error(
            { error },
            'Failed to sample contacts from people API',
          )
          throw new BadGatewayException(
            'Failed to sample contacts from people API',
          )
        }
      },
    )
  }

  async findPerson(
    id: string,
    campaign: CampaignWithPathToVictory,
    organization?: Organization,
  ): Promise<PersonOutput> {
    const fetchPerson = async (districtParams: {
      districtId?: string
      state?: string
      districtType?: string
      districtName?: string
    }) => {
      try {
        const response = await lastValueFrom(
          this.httpService.get<PersonOutput>(
            `${PEOPLE_API_URL}/v1/people/${id}`,
            {
              headers: {
                Authorization: `Bearer ${this.getValidS2SToken()}`,
              },
              params: districtParams,
            },
          ),
        )

        return response.data
      } catch (error) {
        if (error instanceof HttpException) {
          throw error
        }
        this.logger.error(
          { data: JSON.stringify(error) },
          'Failed to fetch person from people API',
        )

        if (isAxiosError(error) && error.response?.status === 404) {
          throw new NotFoundException('Person not found')
        }

        throw new BadGatewayException('Failed to fetch person from people API')
      }
    }

    if (organization) {
      return this.withOrgDistrictResolution(organization, campaign, fetchPerson)
    }

    return this.withFallbackDistrictName(
      campaign,
      async ({ state, districtType, districtName }) => {
        const params: Record<string, string> = { state }
        if (districtType && districtName) {
          params.districtType = districtType
          params.districtName = districtName
        }
        return fetchPerson(params)
      },
    )
  }

  async downloadContacts(
    { segment }: DownloadContactsDTO,
    campaign: CampaignWithPathToVictory,
    res: FastifyReply,
    organization?: Organization,
  ) {
    const hasElectedOffice = await this.hasElectedOfficeAccess(
      campaign.userId,
      organization,
    )
    if (!campaign.isPro && !hasElectedOffice) {
      throw new BadRequestException('Campaign is not pro')
    }
    const filters = await this.segmentToFilters(segment, campaign)

    const downloadPeople = async (districtParams: {
      districtId?: string
      state?: string
      districtType?: string
      districtName?: string
    }) => {
      try {
        const response = await lastValueFrom(
          this.httpService.post<Readable>(
            `${PEOPLE_API_URL}/v1/people/download`,
            { ...districtParams, filters },
            {
              headers: {
                Authorization: `Bearer ${this.getValidS2SToken()}`,
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
        this.logger.error(
          {
            error,
          },
          'Failed to download contacts from people API',
        )

        throw new BadGatewayException(
          'Failed to download contacts from people API',
        )
      }
    }

    if (organization) {
      return this.withOrgDistrictResolution(
        organization,
        campaign,
        downloadPeople,
      )
    }

    return this.withFallbackDistrictName(campaign, downloadPeople)
  }

  async getDistrictStats(
    campaign: CampaignWithPathToVictory,
    organization?: Organization,
  ) {
    const fetchStats = async (districtParams: {
      districtId?: string
      state?: string
      districtType?: string
      districtName?: string
    }) => {
      const token = this.getValidS2SToken()

      const response = await lastValueFrom(
        this.httpService.get<StatsResponse>(
          `${PEOPLE_API_URL}/v1/people/stats`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: districtParams,
          },
        ),
      )

      return response.data
    }

    if (organization) {
      return this.withOrgDistrictResolution(organization, campaign, fetchStats)
    }

    return this.withFallbackDistrictName(
      campaign,
      async ({ state, districtType, districtName }) => {
        if (!state) {
          const msg = 'Could not resolve state for contacts stats'
          this.logger.error({
            campaign,
            msg,
            state,
            districtType,
            districtName,
          })
          throw new BadRequestException(msg)
        }

        const params: Record<string, string> = { state }
        if (districtType && districtName) {
          params.districtType = districtType
          params.districtName = districtName
        }
        return fetchStats(params)
      },
    )
  }

  private getValidS2SToken(): string {
    if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
      return this.cachedToken
    }

    return this.generateAndCacheS2SToken()
  }

  private isTokenValid(token: string): boolean {
    try {
      // jwt.decode returns string | JwtPayload | null — runtime shape depends on token contents
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
  } {
    const state = this.getCampaignState(campaign)

    const ptv = campaign.pathToVictory?.data as
      | { electionType?: string; electionLocation?: string }
      | undefined
    const electionType = ptv?.electionType
    const electionLocation = ptv?.electionLocation

    if (electionType && electionLocation) {
      const cleanedName = this.elections.cleanDistrictName(electionLocation) // removes ##
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
        return { state }
      }

      return {
        state,
        districtType: electionType,
        districtName: cleanedName,
        alternativeDistrictName: alternativeCleanedName,
      }
    }

    if (this.canUseStatewideFallback(campaign)) {
      return { state }
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
      // Dynamic key lookup into const object — TypeScript cannot narrow string to known keys
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      SHORT_TO_LONG_STATE[stateCode as keyof typeof SHORT_TO_LONG_STATE]
    const matchesCode = districtName.toUpperCase() === stateCode.toUpperCase()
    const matchesLong =
      typeof stateLong === 'string' &&
      districtName.toLowerCase() === stateLong.toLowerCase()
    return type === 'state' ? matchesCode || matchesLong : false
  }

  private async segmentToFilters(
    segment: string | undefined,
    campaign: CampaignWithPathToVictory,
  ): Promise<FilterObject> {
    const resolvedSegment = segment || 'all'
    const segmentToFiltersMap =
      defaultSegmentToFiltersMap[
        // Dynamic key lookup into const object — TypeScript cannot narrow string to known keys
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
}
