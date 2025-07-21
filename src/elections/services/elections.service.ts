import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import {
  BuildRaceTargetDetailsInput,
  ProjectedTurnout,
  RaceTargetMetrics,
} from '../types/elections.types'
import { P2VSource } from 'src/pathToVictory/types/pathToVictory.types'
import { P2VStatus } from '../types/pathToVictory.types'
import { ElectionApiRoutes } from '../constants/elections.const'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'

@Injectable()
export class ElectionsService {
  private static readonly BASE_URL = process.env.ELECTION_API_URL
  private static readonly VOTER_CONTACT_MULTIPLIER = 5
  private static readonly WIN_NUMBER_MULTIPLIER = 0.5
  private static readonly API_VERSION = 'v1'

  private readonly logger = new Logger(ElectionsService.name)

  constructor(private readonly httpService: HttpService) {
    if (!ElectionsService.BASE_URL) {
      throw new Error(`Please set ELECTION_API_URL in your .env. 
        Recommendation is to point it at dev if you are developing`)
    }
  }

  private async electionApiGet<Res, Q extends object>(
    path: string,
    query?: Q,
  ): Promise<Res | null> {
    try {
      const { data, status } = await lastValueFrom(
        this.httpService.get(
          `${ElectionsService.BASE_URL}/${ElectionsService.API_VERSION}/${path}`,
          {
            params: query,
            paramsSerializer: (params) =>
              Object.entries(params)
                .filter(([, v]) => v !== undefined && v !== null)
                .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
                .join('&'),
          },
        ),
      )
      if (status >= 200 && status < 300) return data
      this.logger.warn(`Election API GET ${path}} responded ${status}`)
      return null
    } catch (error) {
      this.logger.error(`Election API GET ${path} failed: ${error}`)
      throw new BadGatewayException(`Election API GET ${path} failed: ${error}`)
    }
  }

  private calculateRaceTargetMetrics(
    projectedTurnout: number,
  ): RaceTargetMetrics {
    const winNumber =
      Math.ceil(projectedTurnout * ElectionsService.WIN_NUMBER_MULTIPLIER) + 1
    return {
      winNumber,
      voterContactGoal: winNumber * ElectionsService.VOTER_CONTACT_MULTIPLIER,
    }
  }

  async buildRaceTargetDetails(
    data: BuildRaceTargetDetailsInput,
  ): Promise<PrismaJson.PathToVictoryData | null> {
    const projectedTurnout = await this.electionApiGet<
      ProjectedTurnout,
      BuildRaceTargetDetailsInput
    >(ElectionApiRoutes.projectedTurnout.find.path, data)

    return projectedTurnout
      ? {
          ...this.calculateRaceTargetMetrics(projectedTurnout.projectedTurnout),
          projectedTurnout: projectedTurnout.projectedTurnout,
          source: P2VSource.ElectionApi,
          electionType: projectedTurnout.L2DistrictType,
          electionLocation: projectedTurnout.L2DistrictName,
          p2vAttempts: 1,
          p2vStatus: P2VStatus.complete,
        }
      : null
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
}
