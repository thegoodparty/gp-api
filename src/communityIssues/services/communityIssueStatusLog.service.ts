import { Injectable } from '@nestjs/common'
import { IssueStatus } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class CommunityIssueStatusLogService extends createPrismaBase(
  MODELS.CommunityIssueStatusLog,
) {
  async createStatusLog(
    communityIssueUuid: string,
    fromStatus: IssueStatus | null,
    toStatus: IssueStatus,
  ) {
    return this.model.create({
      data: {
        communityIssueUuid,
        fromStatus,
        toStatus,
      },
    })
  }

  async getStatusHistory(communityIssueUuid: string) {
    return this.model.findMany({
      where: { communityIssueUuid },
      orderBy: { createdAt: 'asc' },
    })
  }

  async logInitialStatus(communityIssueUuid: string, status: IssueStatus) {
    return this.createStatusLog(communityIssueUuid, null, status)
  }
}
