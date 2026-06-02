import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CommunityEventsResult } from '../schemas/communityEvents.schema'

@Injectable()
export class CommunityEventsPersister extends createPrismaBase(
  MODELS.CampaignStrategy,
) {
  // Single-column update over the `community_events` JSON slot. No
  // transaction needed — one row, one column. last-write-wins on the
  // rare cross-pod race; the next poll's cache read picks up whichever
  // version landed.
  async persist(
    campaignStrategyId: number,
    result: CommunityEventsResult,
  ): Promise<void> {
    await this.client.campaignStrategy.update({
      where: { id: campaignStrategyId },
      data: { communityEvents: result },
    })
  }
}
