import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { isAxiosError } from 'axios'
import { lastValueFrom } from 'rxjs'
import { P2VSource } from 'src/pathToVictory/types/pathToVictory.types'
import { SlackService } from 'src/shared/services/slack.service'
import { SlackChannel } from 'src/shared/services/slackService.types'
import { DateFormats, formatDate } from 'src/shared/util/date.util'
import { ElectionApiRoutes } from '../constants/elections.const'
import {
  BuildRaceTargetDetailsInput,
  PositionWithMatchedDistrict,
  ProjectedTurnout,
  RaceTargetMetrics,
} from '../types/elections.types'
import { P2VStatus } from '../types/pathToVictory.types'

// TODO: Revisit this file after the stakeholders decide on the direction we're going...
// ...for the win number / p2v solution. Remove any unneeded code at that time.

@Injectable()
export class ElectionsService {
  private static readonly BASE_URL = process.env.ELECTION_API_URL
  private static readonly VOTER_CONTACT_MULTIPLIER = 5
  private static readonly WIN_NUMBER_MULTIPLIER = 0.5
  private static readonly API_VERSION = 'v1'

  private readonly logger = new Logger(ElectionsService.name)

  constructor(
    private readonly httpService: HttpService,
    private readonly slack: SlackService,
  ) {
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
    try {
      const { data, status } = await lastValueFrom(
        this.httpService.get(fullUrl, {
          params: query,
          paramsSerializer: (params) =>
            Object.entries(params)
              .filter(([, v]) => v !== undefined && v !== null)
              .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
              .join('&'),
        }),
      )
      if (status >= 200 && status < 300) return data
      this.logger.warn(`Election API GET ${path}} responded ${status}`)
      return null
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    } catch (error: unknown) {
      const baseMessage = `Election API GET ${path} failed`
      if (isAxiosError(error)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
            data: error.response?.data,
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

  async getBallotReadyMatchedRaceTargetDetails(
    ballotreadyPositionId: string,
    electionDate: string,
  ) {
    try {
      const positionWithDistrict = await this.electionApiGet<
        PositionWithMatchedDistrict,
        { electionDate: string; includeDistrict: boolean }
      >(
        ElectionApiRoutes.positions.findByBrId.path +
          `/${ballotreadyPositionId}`,
        {
          electionDate,
          includeDistrict: true,
        },
      )
      if (!positionWithDistrict) {
        throw new NotFoundException('No positionWithDistrict found')
      }

      return {
        ...this.calculateRaceTargetMetrics(
          positionWithDistrict?.district.projectedTurnout.projectedTurnout,
        ),
        district: positionWithDistrict.district,
      }
    } catch (error) {
      const message = this.buildSlackErrorMessage(
        'Election API error: getBallotReadyMatchedRaceTargetDetails',
        { ballotreadyPositionId, electionDate },
        error,
      )
      await this.slack.formattedMessage({
        message,
        error,
        channel: SlackChannel.botPathToVictoryIssues,
      })
      return null
    }
  }

  async buildRaceTargetDetails(
    data: BuildRaceTargetDetailsInput,
  ): Promise<PrismaJson.PathToVictoryData | null> {
    const query = {
      ...data,
      L2DistrictName: this.cleanDistrictName(data.L2DistrictName),
    }
    try {
      const projectedTurnout = await this.electionApiGet<
        ProjectedTurnout,
        BuildRaceTargetDetailsInput
      >(ElectionApiRoutes.projectedTurnout.find.path, query)

      if (!projectedTurnout) {
        throw new NotFoundException('No projectedTurnout found')
      }

      return {
        ...this.calculateRaceTargetMetrics(projectedTurnout.projectedTurnout),
        source: P2VSource.ElectionApi,
        electionType: projectedTurnout.L2DistrictType,
        electionLocation: projectedTurnout.L2DistrictName,
        p2vStatus: P2VStatus.complete,
        p2vCompleteDate: formatDate(new Date(), DateFormats.isoDate),
      }
    } catch (error) {
      const {
        state,
        L2DistrictType,
        L2DistrictName,
        electionCode,
        electionDate,
        electionYear,
      } = data
      const message = this.buildSlackErrorMessage(
        'Election API error: buildRaceTargetDetails',
        {
          state,
          L2DistrictType,
          L2DistrictName,
          electionCode,
          electionDate,
          electionYear,
        },
        error,
      )
      await this.slack.formattedMessage({
        message,
        error,
        channel: SlackChannel.botPathToVictoryIssues,
      })
      return null
    }
  }

  async getValidDistrictTypes(state: string, electionYear: string | number) {
    return await this.electionApiGet(ElectionApiRoutes.districts.types.path, {
      electionYear,
      state,
      excludeInvalid: true,
    })
  }

  async getValidDistrictNames(
    L2DistrictType: string,
    state?: string,
    electionYear?: string | number,
  ) {
    return await this.electionApiGet(ElectionApiRoutes.districts.names.path, {
      L2DistrictType,
      state,
      electionYear,
      excludeInvalid: true,
    })
  }

  cleanDistrictName(L2DistrictName: string) {
    const segments = L2DistrictName.split('##')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    if (segments.length === 0) return L2DistrictName
    let longest = segments[0]
    for (let i = 1; i < segments.length; i++) {
      if (segments[i].length > longest.length) {
        longest = segments[i]
      }
    }
    return longest
  }
}
