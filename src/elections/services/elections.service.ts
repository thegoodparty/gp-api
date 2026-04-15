import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { isAxiosError } from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { lastValueFrom } from 'rxjs'
import { serializeError } from 'serialize-error'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { SlackChannel } from 'src/vendors/slack/slackService.types'
import { ElectionApiRoutes } from '../constants/elections.const'
import {
  BuildRaceTargetDetailsInput,
  District,
  DistrictNameItem,
  DistrictTypeItem,
  PositionWithOptionalDistrict,
  ProjectedTurnout,
  RaceTargetDetailsResult,
  RaceTargetMetrics,
} from '../types/elections.types'

@Injectable()
export class ElectionsService {
  private static readonly BASE_URL = process.env.ELECTION_API_URL
  private static readonly VOTER_CONTACT_MULTIPLIER = 5
  private static readonly WIN_NUMBER_MULTIPLIER = 0.5
  private static readonly API_VERSION = 'v1'

  constructor(
    private readonly httpService: HttpService,
    private readonly slack: SlackService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ElectionsService.name)
    if (!ElectionsService.BASE_URL) {
      throw new Error(`Please set ELECTION_API_URL in your .env.
        Recommendation is to point it at dev if you are developing`)
    }
  }

  private async electionApiGet<Res, Q extends object>(
    path: string,
    query?: Q,
  ): Promise<Res | null> {
    const fullUrl = `${ElectionsService.BASE_URL}/${ElectionsService.API_VERSION}/${path}`
    const rawParams = (query ?? {}) as Record<
      string,
      string | number | boolean | null | undefined
    >
    // Object.keys/fromEntries returns string[] — TypeScript deliberately widens key types
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const filteredParams = Object.fromEntries(
      Object.entries(rawParams).filter(
        ([, v]) => v !== undefined && v !== null,
      ),
    ) as Record<string, string | number | boolean>
    this.logger.debug({ filteredParams }, `Election API GET ${path} params: `)
    try {
      const { data, status } = (await lastValueFrom(
        this.httpService.get(fullUrl, {
          params: query,
          paramsSerializer: (params) =>
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
              .join('&'),
        }),
      )) as { data: Res; status: number }
      if (status >= 200 && status < 300) return data
      this.logger.warn(`Election API GET ${path}} responded ${status}`)
      return null
    } catch (error: unknown) {
      const baseMessage = `Election API GET ${path} failed`
      if (isAxiosError(error)) {
        // Axios error response is untyped — AxiosError.response.data is unknown
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        const data = error.response?.data as Record<string, unknown> | undefined
        const apiMessage =
          typeof data?.message === 'string' ? data.message : undefined
        const finalMessage = apiMessage
          ? `${baseMessage}: ${apiMessage}`
          : `${baseMessage}: ${error.message}`
        this.logger.error(finalMessage)
        throw new BadGatewayException(finalMessage)
      }
      const finalMessage = `${baseMessage}: ${String(error)}`
      this.logger.error(`Election API GET ${fullUrl} failed: ${String(error)}`)
      throw new BadGatewayException(finalMessage)
    }
  }

  private buildSlackErrorMessage(
    title: string,
    context: Record<string, string | number | boolean | null | undefined>,
    error: unknown,
  ): string {
    const contextLines = Object.entries(context)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => `- *${key}*: ${String(value)}`)
      .join('\n')

    const errorDetails = isAxiosError(error)
      ? JSON.stringify(
          {
            status: error.response?.status,
            // Axios error response is untyped — AxiosError.response.data is unknown
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            data: error.response?.data as Record<
              string,
              string | number | boolean
            >,
          },
          null,
          2,
        )
      : error instanceof Error
        ? error.message
        : String(error)

    return `*${title}*\n${contextLines}\n\n\`\`\`\n${errorDetails}\n\`\`\``
  }

  private calculateRaceTargetMetrics(
    projectedTurnout: number,
  ): RaceTargetMetrics {
    const winNumber =
      Math.ceil(projectedTurnout * ElectionsService.WIN_NUMBER_MULTIPLIER) + 1
    return {
      winNumber,
      voterContactGoal: winNumber * ElectionsService.VOTER_CONTACT_MULTIPLIER,
      projectedTurnout,
    }
  }

  async getPositionByBallotReadyId(
    ballotreadyPositionId: string,
    options?: { includeDistrict?: boolean },
  ) {
    return this.electionApiGet<
      PositionWithOptionalDistrict,
      { includeDistrict: boolean; includeTurnout: boolean }
    >(
      ElectionApiRoutes.positions.findByBrId.path + `/${ballotreadyPositionId}`,
      {
        includeDistrict: options?.includeDistrict ?? false,
        includeTurnout: false,
      },
    )
  }
  async getPositionById(
    positionId: string,
    options?: {
      includeDistrict?: boolean
      includeTurnout?: boolean
      electionDate?: string
    },
  ) {
    return this.electionApiGet<
      PositionWithOptionalDistrict,
      {
        includeDistrict: boolean
        includeTurnout: boolean
        electionDate?: string
      }
    >(`${ElectionApiRoutes.positions.findById.path}/${positionId}`, {
      includeDistrict: options?.includeDistrict ?? false,
      includeTurnout: options?.includeTurnout ?? false,
      electionDate: options?.electionDate,
    })
  }

  async getDistrict(id: string): Promise<District | null> {
    return this.electionApiGet<District, object>(`districts/${id}`, {})
  }

  async getDistrictId(
    state: string,
    l2DistrictType: string,
    l2DistrictName: string,
  ): Promise<string | null> {
    const districts = await this.electionApiGet<
      { id: string }[],
      {
        state: string
        L2DistrictType: string
        L2DistrictName: string
        districtColumns: string
      }
    >(ElectionApiRoutes.districts.list.path, {
      state,
      L2DistrictType: l2DistrictType,
      L2DistrictName: this.cleanDistrictName(l2DistrictName),
      districtColumns: 'id',
    })
    return districts?.[0]?.id ?? null
  }
  // Gold flow: match a district via BallotReady position ID.
  // Returns district data even when projected turnout is unavailable,
  // using sentinel values (-1) so callers can distinguish partial matches.
  async getPositionMatchedRaceTargetDetails(
    params: {
      electionDate?: string
      includeTurnout: boolean
      campaignId: number
      officeName: string | undefined
    } & (
      | { ballotreadyPositionId: string; positionId?: never }
      | { positionId: string; ballotreadyPositionId?: never }
    ),
  ) {
    const {
      ballotreadyPositionId,
      positionId,
      electionDate,
      includeTurnout,
      campaignId,
      officeName,
    } = params

    const path = ballotreadyPositionId
      ? `${ElectionApiRoutes.positions.findByBrId.path}/${ballotreadyPositionId}`
      : `${ElectionApiRoutes.positions.findById.path}/${positionId}`

    let positionWithDistrict: PositionWithOptionalDistrict | null = null
    try {
      positionWithDistrict = await this.electionApiGet<
        PositionWithOptionalDistrict,
        {
          electionDate: string | undefined
          includeDistrict: boolean
          includeTurnout: boolean
        }
      >(path, {
        electionDate: electionDate ?? undefined,
        includeDistrict: true,
        includeTurnout,
      })

      const { district } = positionWithDistrict ?? {}
      if (!positionWithDistrict || !district) {
        throw new NotFoundException(
          'No position and/or associated district was found',
        )
      }

      const turnoutValue = district.projectedTurnout?.projectedTurnout
      const hasTurnout = includeTurnout && !!turnoutValue
      const { L2DistrictType: districtType, L2DistrictName: districtName } =
        district

      this.logger.info({
        event: 'DistrictMatch',
        matchType: 'gold',
        result: hasTurnout ? 'success' : 'partial',
        electionDate,
        campaignId,
        ballotreadyPositionId,
        positionId,
        officeName,
        districtType,
        districtName,
        projectedTurnout: turnoutValue,
      })
      return {
        district,
        ...(hasTurnout
          ? this.calculateRaceTargetMetrics(turnoutValue)
          : {
              // Sentinel values: turnout unavailable or not requested
              winNumber: -1,
              voterContactGoal: -1,
              projectedTurnout: -1,
            }),
      }
    } catch (error) {
      const { district } = positionWithDistrict ?? {}
      this.logger.info({
        event: 'DistrictMatch',
        matchType: 'gold',
        result: 'failure',
        reason: error instanceof Error ? error.message : String(error),
        error: serializeError(error),
        electionDate,
        campaignId,
        ballotreadyPositionId,
        positionId,
        officeName,
        districtType: district?.L2DistrictType,
        districtName: district?.L2DistrictName,
        projectedTurnout: district?.projectedTurnout?.projectedTurnout,
      })
      const message = this.buildSlackErrorMessage(
        'Election API error: getPositionMatchedRaceTargetDetails',
        {
          ballotreadyPositionId,
          positionId,
          electionDate,
          campaignId,
        },
        error,
      )
      await this.slack.formattedMessage({
        message,
        error,
        channel: SlackChannel.botDev,
      })
      throw error
    }
  }

  async buildRaceTargetDetails(
    data: BuildRaceTargetDetailsInput,
  ): Promise<RaceTargetDetailsResult | null> {
    const query =
      'districtId' in data
        ? data
        : {
            ...data,
            L2DistrictName: this.cleanDistrictName(data.L2DistrictName),
          }
    try {
      const projectedTurnout = await this.electionApiGet<
        ProjectedTurnout,
        typeof query
      >(ElectionApiRoutes.projectedTurnout.find.path, query)

      if (!projectedTurnout) {
        throw new NotFoundException('No projectedTurnout found')
      }

      const { projectedTurnout: turnout } = projectedTurnout

      return this.calculateRaceTargetMetrics(turnout)
    } catch (error) {
      const context: Record<string, string | number | undefined> =
        'districtId' in data
          ? { districtId: data.districtId }
          : {
              state: data.state,
              L2DistrictType: data.L2DistrictType,
              L2DistrictName: data.L2DistrictName,
            }
      if ('electionDate' in data) context.electionDate = data.electionDate
      if ('electionCode' in data) {
        context.electionCode = data.electionCode
        context.electionYear = data.electionYear
      }
      const message = this.buildSlackErrorMessage(
        'Election API error: buildRaceTargetDetails',
        context,
        error,
      )
      await this.slack.formattedMessage({
        message,
        error,
        channel: SlackChannel.botDev,
      })
      return null
    }
  }

  async getValidDistrictTypes(
    state: string,
    electionYear: string | number,
    excludeInvalid = true,
  ) {
    const shouldExclude = excludeInvalid === true
    const query = {
      state,
      excludeInvalid: shouldExclude,
      ...(shouldExclude ? { electionYear } : {}),
    }
    return await this.electionApiGet<DistrictTypeItem[], typeof query>(
      ElectionApiRoutes.districts.types.path,
      query,
    )
  }

  async getValidDistrictNames(
    l2DistrictType: string,
    state?: string,
    electionYear?: string | number,
    excludeInvalid = true,
  ) {
    const shouldExclude = excludeInvalid === true
    const query = {
      L2DistrictType: l2DistrictType,
      state,
      excludeInvalid: shouldExclude,
      ...(shouldExclude ? { electionYear } : {}),
    }
    return await this.electionApiGet<DistrictNameItem[], typeof query>(
      ElectionApiRoutes.districts.names.path,
      query,
    )
  }

  cleanDistrictName(l2DistrictName: string) {
    const segments = l2DistrictName
      .split('##')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (segments.length === 0) return l2DistrictName
    let longest = segments[0]
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].length > longest.length) {
        longest = segments[i]
      }
    }
    return longest
  }
}
