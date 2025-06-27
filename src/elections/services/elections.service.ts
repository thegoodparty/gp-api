import { Logger } from '@nestjs/common'
import { ProjectedTurnout, RaceTargetMetrics } from '../types/elections.types'
import { P2VSource } from 'src/pathToVictory/types/pathToVictory.types'
import { P2VStatus } from '../types/pathToVictory.types'

const VOTER_CONTACT_MULTIPLIER = 5
const WIN_NUMBER_MULTIPLIER = 0.51

const ELECTION_API_URL =
  process.env.ELECTION_API_URL || 'https://election-api-dev.goodparty.org'

export class ElectionsService {
  private readonly logger = new Logger(ElectionsService.name)

  private async fetchProjectedTurnout(
    brPositionId: string,
  ): Promise<ProjectedTurnout | null> {
    const params = new URLSearchParams({ brPositionId })
    const apiVersion = 'v1'
    try {
      const response = await fetch(
        `${ELECTION_API_URL}/${apiVersion}/projectedTurnout?${params.toString()}`,
      )
      return response.ok ? ((await response.json()) as ProjectedTurnout) : null
    } catch (err) {
      this.logger.debug(`Error: Couldn't fetch projected turnout - ${err}`)
      return null
    }
  }

  private calculateRaceTargetMetrics(
    projectedTurnout: number,
  ): RaceTargetMetrics {
    return {
      winNumber: Math.ceil(projectedTurnout * WIN_NUMBER_MULTIPLIER),
      voterContactGoal: projectedTurnout * VOTER_CONTACT_MULTIPLIER,
    }
  }

  async buildRaceTargetDetails(
    ballotreadyPositionId: string,
  ): Promise<PrismaJson.PathToVictoryData | null> {
    const projectedTurnout = await this.fetchProjectedTurnout(
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
}
