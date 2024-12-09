import { PrismaClient } from '@prisma/client'
import { campaignFactory } from './factories/campaign.factory'
import { campaignUpdateHistoryFactory } from './factories/campaignUpdateHistory.factory'
import { topIssueFactory } from './factories/topIssue.factory'
import { positionFactory } from './factories/position.factory'
import { campaignPositionFactory } from './factories/campaignPosition.factory'

export default async function seedTopIssues(prisma: PrismaClient, campaignIds: number[]) {
  const NUM_TOP_ISSUES = 5;
  const NUM_POSITIONS_PER_ISSUE = 3;
  const NUM_CAMPAIGN_POSITIONS_PER_ISSUE = 2;

  for (let i = 0; i < NUM_TOP_ISSUES; i++) {
    const topIssue = await prisma.topIssue.create({
      data: topIssueFactory()
    });

    for (let j = 0; j < NUM_POSITIONS_PER_ISSUE; j++) {
      const position = await prisma.position.create({
        data: positionFactory({ topIssueId: topIssue.id})
      });

      for (let k = 0; k < NUM_CAMPAIGN_POSITIONS_PER_ISSUE; k++) {
        await prisma.campaignPosition.create({
          data: campaignPositionFactory({ 
            positionId: position.id,
            topIssueId: topIssue.id, 
            campaignId: campaignIds[i]
          }),
        })
      }
    }
  }
}
