import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { IssueStatus } from '@prisma/client'

@Injectable()
export class CommunityIssueStatusLogService {
  constructor(private readonly prisma: PrismaService) {}

  async createStatusLog(
    communityIssueId: number,
    fromStatus: IssueStatus | null,
    toStatus: IssueStatus,
  ) {
    return this.prisma.communityIssueStatusLog.create({
      data: {
        communityIssueId,
        fromStatus,
        toStatus,
      },
    })
  }

  async getStatusHistory(communityIssueId: number) {
    return this.prisma.communityIssueStatusLog.findMany({
      where: { communityIssueId },
      orderBy: { createdAt: 'asc' },
    })
  }

  async logInitialStatus(communityIssueId: number, status: IssueStatus) {
    return this.createStatusLog(communityIssueId, null, status)
  }

  async logStatusChangeIfNeeded(
    communityIssueId: number,
    oldStatus: IssueStatus,
    newStatus: IssueStatus,
  ) {
    if (oldStatus !== newStatus) {
      return this.createStatusLog(communityIssueId, oldStatus, newStatus)
    }
    return null
  }
}
