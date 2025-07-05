import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { IssueStatus } from '@prisma/client'

@Injectable()
export class CommunityIssueStatusLogService extends createPrismaBase(
  MODELS.CommunityIssueStatusLog,
) {
  async createStatusLog(
    communityIssueId: number,
    fromStatus: IssueStatus | null,
    toStatus: IssueStatus,
  ) {
    return this.model.create({
      data: {
        communityIssueId,
        fromStatus,
        toStatus,
      },
    })
  }

  async getStatusHistory(communityIssueId: number) {
    return this.model.findMany({
      where: { communityIssueId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async logInitialStatus(communityIssueId: number, status: IssueStatus) {
    return this.createStatusLog(communityIssueId, null, status)
  }
}
