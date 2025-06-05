import {
  BadGatewayException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import { ProjectedTurnout } from '../types/elections.types'

const ELECTION_API_URL = process.env.ELECTION_API_URL

export class ElectionsService {
  private readonly logger = new Logger(ElectionsService.name)

  async fetchProjectedTurnout(brPositionId: string): Promise<ProjectedTurnout> {
    try {
      const params = new URLSearchParams({ brPositionId })
      const response = await fetch(`${ELECTION_API_URL}?${params.toString()}`)
      if (!response.ok) throw new BadGatewayException()
      return (await response.json()) as ProjectedTurnout
    } catch {
      throw new InternalServerErrorException()
    }
  }
}
