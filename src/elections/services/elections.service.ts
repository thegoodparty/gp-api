import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { lastValueFrom } from 'rxjs'
import { P2VSource } from 'src/pathToVictory/types/pathToVictory.types'
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
      projectedTurnout,
    }
  }

  async getBallotReadyMatchedRaceTargetDetails(
    ballotreadyPositionId: string,
    electionDate: string,
  ) {
    const positionWithDistrict = await this.electionApiGet<
      PositionWithMatchedDistrict,
      { electionDate: string; includeDistrict: boolean }
    >(
      ElectionApiRoutes.positions.findByBrId.path + `/${ballotreadyPositionId}`,
      {
        electionDate,
        includeDistrict: true,
      },
    )

    return positionWithDistrict
      ? {
          ...this.calculateRaceTargetMetrics(
            positionWithDistrict?.district.projectedTurnout.projectedTurnout,
          ),
          district: positionWithDistrict.district,
        }
      : null
  }

  async buildRaceTargetDetails(
    data: BuildRaceTargetDetailsInput,
  ): Promise<PrismaJson.PathToVictoryData | null> {
    const query = {
      ...data,
      L2DistrictName: this.cleanDistrictName(data.L2DistrictName),
    }
    const projectedTurnout = await this.electionApiGet<
      ProjectedTurnout,
      BuildRaceTargetDetailsInput
    >(ElectionApiRoutes.projectedTurnout.find.path, query)

    return projectedTurnout
      ? {
          ...this.calculateRaceTargetMetrics(projectedTurnout.projectedTurnout),
          source: P2VSource.ElectionApi,
          electionType: projectedTurnout.L2DistrictType,
          electionLocation: projectedTurnout.L2DistrictName,
          p2vStatus: P2VStatus.complete,
          p2vCompleteDate: new Date().toISOString().slice(0, 10),
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

  private cleanDistrictName(L2DistrictName: string) {
    const parts = L2DistrictName.split('##', 2)
    return parts.length > 1 ? parts[1] : L2DistrictName
  }
}
