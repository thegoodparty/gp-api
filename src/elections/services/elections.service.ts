import { BadGatewayException, Logger, NotFoundException } from '@nestjs/common'
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
    try {
      const params = new URLSearchParams({ brPositionId })
      const apiVersion = 'v1'
      const response = await fetch(
        `${ELECTION_API_URL}/${apiVersion}/projectedTurnout?${params.toString()}`,
      )
      if (response.status === 404) {
        throw new NotFoundException(
          'ElectionAPI did not have the projected turnout for brPositionId: ',
          brPositionId,
        )
      }
      if (!response.ok) throw new BadGatewayException()
      return (await response.json()) as ProjectedTurnout
    } catch (err) {
      this.logger.warn(err)
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
    brPositionId: string,
  ): Promise<PrismaJson.PathToVictoryData | null> {
    const projectedTurnout = await this.fetchProjectedTurnout(brPositionId)
    if (!projectedTurnout) return null

    const raceTargetMetrics = this.calculateRaceTargetMetrics(
      projectedTurnout.projectedTurnout,
    )
    const { L2DistrictType, L2DistrictName } = projectedTurnout

    return {
      ...raceTargetMetrics,
      projectedTurnout: projectedTurnout.projectedTurnout,
      source: P2VSource.ElectionApi,
      electionType: L2DistrictType,
      electionLocation: L2DistrictName,
      p2vAttempts: 1,
      p2vStatus: P2VStatus.complete,
    }
  }
}
