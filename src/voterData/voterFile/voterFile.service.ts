import { Injectable, Logger } from '@nestjs/common'
import { Prisma } from '@prisma/client'

@Injectable()
export class VoterFileService {
  private readonly logger = new Logger(VoterFileService.name)

  constructor() {}

  canDownload(
    campaign?: Prisma.CampaignGetPayload<{ include: { pathToVictory: true } }>,
  ) {
    if (!campaign) return false

    let electionTypeRequired = true
    if (
      campaign.details.ballotLevel &&
      campaign.details.ballotLevel !== 'FEDERAL' &&
      campaign.details.ballotLevel !== 'STATE'
    ) {
      // not required for state/federal races
      // so we can fall back to the whole state.
      electionTypeRequired = false
    }
    if (
      electionTypeRequired &&
      (!campaign.pathToVictory?.data?.electionType ||
        !campaign.pathToVictory?.data?.electionLocation)
    ) {
      this.logger.log('Campaign is not eligible for download.', campaign.id)
      return false
    } else {
      return true
    }
  }
}
