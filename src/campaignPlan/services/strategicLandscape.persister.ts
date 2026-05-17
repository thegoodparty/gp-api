import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { StrategicLandscapeResult } from '../schemas/strategicLandscape.schema'

@Injectable()
export class StrategicLandscapePersister extends createPrismaBase(
  MODELS.CampaignPlan,
) {
  async persist(
    campaignPlanId: number,
    result: StrategicLandscapeResult,
  ): Promise<void> {
    // v1: first-write-wins. The @@unique([campaignPlanId, order]) on
    // campaignPlanOpportunity serializes concurrent generation attempts —
    // the second request hits P2002 and the service falls back to the
    // cached read. When we add regeneration, replace this with
    // deleteMany + create inside an advisory lock so two regen requests
    // can't interleave their writes.
    await this.client.$transaction(async (tx) => {
      await tx.campaignPlanOpportunity.createMany({
        data: result.opportunities.map((content, i) => ({
          campaignPlanId,
          order: i + 1,
          content,
        })),
      })

      await tx.campaignPlanChallenge.createMany({
        data: result.challenges.map((content, i) => ({
          campaignPlanId,
          order: i + 1,
          content,
        })),
      })

      for (const opponent of result.opponents) {
        await tx.campaignPlanOpponent.create({
          data: {
            campaignPlanId,
            fullName: opponent.fullName,
            partyAffiliation: opponent.partyAffiliation,
            incumbent: opponent.incumbent,
            politicalSummary: opponent.politicalSummary,
            keyFacts: {
              create: opponent.keyFacts.map((content, i) => ({
                order: i + 1,
                content,
              })),
            },
            websites: {
              create: opponent.websites.map((url) => ({ url })),
            },
          },
        })
      }
    })
  }
}
