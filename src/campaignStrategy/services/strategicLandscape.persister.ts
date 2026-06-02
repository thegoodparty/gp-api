import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { Opponent } from '../schemas/strategicLandscape.schema'

@Injectable()
export class StrategicLandscapePersister extends createPrismaBase(
  MODELS.CampaignStrategy,
) {
  // The two CAP runs complete independently, so each section is persisted on
  // its own when its result lands. delete-then-insert makes a re-run (retry or
  // regeneration) overwrite cleanly rather than accumulate duplicate rows.
  async persistOpponents(
    campaignStrategyId: number,
    opponents: Opponent[],
  ): Promise<void> {
    await this.client.$transaction(async (tx) => {
      await tx.campaignStrategyOpponent.deleteMany({
        where: { campaignStrategyId },
      })
      if (opponents.length > 0) {
        await tx.campaignStrategyOpponent.createMany({
          data: opponents.map((o) => ({
            campaignStrategyId,
            fullName: o.fullName,
            partyAffiliation: o.partyAffiliation,
            incumbent: o.incumbent,
          })),
        })
      }
      // Mark persisted in the same tx so 'ready' can't observe rows mid-write.
      // Set even for an uncontested race (zero opponents is a real result).
      await tx.campaignStrategy.update({
        where: { id: campaignStrategyId },
        data: { oppositionPersistedAt: new Date() },
      })
    })
  }

  async persistOpportunitiesAndChallenges(
    campaignStrategyId: number,
    opportunities: string[],
    challenges: string[],
  ): Promise<void> {
    await this.client.$transaction(async (tx) => {
      await tx.campaignStrategyOpportunity.deleteMany({
        where: { campaignStrategyId },
      })
      await tx.campaignStrategyChallenge.deleteMany({
        where: { campaignStrategyId },
      })
      await tx.campaignStrategyOpportunity.createMany({
        data: opportunities.map((content, i) => ({
          campaignStrategyId,
          order: i + 1,
          content,
        })),
      })
      await tx.campaignStrategyChallenge.createMany({
        data: challenges.map((content, i) => ({
          campaignStrategyId,
          order: i + 1,
          content,
        })),
      })
      await tx.campaignStrategy.update({
        where: { id: campaignStrategyId },
        data: { opportunitiesPersistedAt: new Date() },
      })
    })
  }
}
