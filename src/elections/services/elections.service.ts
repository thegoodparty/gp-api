import { Logger } from '@nestjs/common'
import { ProjectedTurnout, RaceTargetMetrics } from '../types/elections.types'
import { P2VSource } from 'src/pathToVictory/types/pathToVictory.types'
import { P2VStatus } from '../types/pathToVictory.types'
import { ElectionApiRoutes } from '../types/elections.const'

export class ElectionsService {
  private static readonly BASE_URL = process.env.ELECTION_API_URL
  private static readonly VOTER_CONTACT_MULTIPLIER = 5
  private static readonly WIN_NUMBER_MULTIPLIER = 0.5
  private static readonly API_VERSION = 'v1'

  private readonly logger = new Logger(ElectionsService.name)

  constructor() {
    if (!ElectionsService.BASE_URL) {
      throw new Error(`Please set ELECTION_API_URL in your .env. 
        Recommendation is to point it at dev if you are developing`)
    }
  }

  private async electionApiGet<T>(
    path: string,
    query?: Record<string, string | number | undefined>,
  ): Promise<T | null> {
    const url = new URL(
      `${ElectionsService.BASE_URL}/${ElectionsService.API_VERSION}/${path}`,
    )

    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value))
        }
      }
    }

    try {
      const res = await fetch(url.toString())
      if (!res.ok) {
        this.logger.warn(
          `Election API GET ${url.pathname} responded ${res.status}`,
        )
        return null
      }
      return (await res.json()) as T
    } catch (error) {
      this.logger.error(`Election API GET ${path} failed: ${error}`)
      return null
    }
  }

  private calculateRaceTargetMetrics(
    projectedTurnout: number,
  ): RaceTargetMetrics {
    return {
      winNumber:
        Math.ceil(projectedTurnout * ElectionsService.WIN_NUMBER_MULTIPLIER) +
        1,
      voterContactGoal:
        projectedTurnout * ElectionsService.VOTER_CONTACT_MULTIPLIER,
    }
  }

  async buildRaceTargetDetails(
    ballotreadyPositionId: string,
  ): Promise<PrismaJson.PathToVictoryData | null> {
    const projectedTurnout = await this.electionApiGet<ProjectedTurnout>(
      ballotreadyPositionId,
    )

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

  async getDistrictTypes(state: string, electionYear: string) {
    return await this.electionApiGet(ElectionApiRoutes.districts.types.path, {
      electionYear,
      state,
    })
  }

  async getDistrictNames(
    L2DistrictType: string,
    state?: string,
    electionYear?: string,
  ) {
    return await this.electionApiGet(ElectionApiRoutes.districts.names.path, {
      L2DistrictType,
      state,
      electionYear,
    })
  }
}
