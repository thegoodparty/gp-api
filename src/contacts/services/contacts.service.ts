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
  private readonly logger = new Logger(ContactsService.name)
  private cachedToken: string | null = null

  constructor(
    private readonly httpService: HttpService,
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly elections: ElectionsService,
    private readonly campaigns: CampaignsService,
    private readonly electedOfficeService: ElectedOfficeService,
  ) {}

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

  async findContacts(
    { resultsPerPage, page, search, segment }: ListContactsDTO,
    campaign: CampaignWithPathToVictory,
  ) {
    if (search) {
      const electedOffice =
        await this.electedOfficeService.getCurrentElectedOffice(campaign.userId)
      if (!campaign.isPro && !electedOffice) {
        throw new BadRequestException(
          'Search is only available for pro campaigns',
        )
      }
    }
    const filters = await this.segmentToFilters(segment, campaign)

    return this.withFallbackDistrictName(
      campaign,
      async ({ state, districtType, districtName }) => {
        try {
          const response = await lastValueFrom(
            this.httpService.post(
              `${PEOPLE_API_URL}/v1/people`,
              {
                state,
                districtType,
                districtName,
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
          return response.data as PeopleListResponse
        } catch (error) {
          this.logger.error(`Failed to fetch from people API`, {
            error,
          })
          throw new BadGatewayException(`Failed to fetch from people API`)
        }
      },
    )
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
          this.logger.error('Failed to sample contacts from people API', error)
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
  ): Promise<PersonOutput> {
    return this.withFallbackDistrictName(
      campaign,
      async ({ state, districtType, districtName }) => {
        try {
          const params: Record<string, string> = { state }
          if (districtType && districtName) {
            params.districtType = districtType
            params.districtName = districtName
          }

          const response = await lastValueFrom(
            this.httpService.get<PersonOutput>(
              `${PEOPLE_API_URL}/v1/people/${id}`,
              {
                headers: {
                  Authorization: `Bearer ${this.getValidS2SToken()}`,
                },
                params,
              },
            ),
          )

          return response.data
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

          throw new BadGatewayException(
            'Failed to fetch person from people API',
          )
        }
      },
    )
  }

  async downloadContacts(
    { segment }: DownloadContactsDTO,
    campaign: CampaignWithPathToVictory,
    res: FastifyReply,
  ) {
    const electedOffice =
      await this.electedOfficeService.getCurrentElectedOffice(campaign.userId)
    if (!campaign.isPro && !electedOffice) {
      throw new BadRequestException('Campaign is not pro')
    }
    const filters = await this.segmentToFilters(segment, campaign)

    return this.withFallbackDistrictName(
      campaign,
      async ({ state, districtType, districtName }) => {
        try {
          const response = await lastValueFrom(
            this.httpService.post(
              `${PEOPLE_API_URL}/v1/people/download`,
              { state, districtType, districtName, filters },
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
          this.logger.error('Failed to download contacts from people API', {
            error,
          })

          throw new BadGatewayException(
            'Failed to download contacts from people API',
          )
        }
      },
    )
  }

  async getDistrictStats(campaign: CampaignWithPathToVictory) {
    return this.withFallbackDistrictName(
      campaign,
      async ({ state, districtType, districtName }) => {
        const token = this.getValidS2SToken()
        const params: Record<string, string> = { state }
        if (districtType && districtName) {
          params.districtType = districtType
          params.districtName = districtName
        }

        const response = await lastValueFrom(
          this.httpService.get<StatsResponse>(
            `${PEOPLE_API_URL}/v1/people/stats`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params,
            },
          ),
        )

        return response.data
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
