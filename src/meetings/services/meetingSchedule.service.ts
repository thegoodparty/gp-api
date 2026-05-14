import { Injectable } from '@nestjs/common'
import { ExperimentRunStatus, Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { S3Service } from '@/vendors/aws/services/s3.service'
import {
  MeetingScheduleArtifact,
  MeetingScheduleArtifactSchema,
} from '@goodparty_org/contracts'

const EXPERIMENT_TYPE = 'meeting_schedule'

@Injectable()
export class MeetingScheduleService extends createPrismaBase(
  MODELS.ExperimentRun,
) {
  constructor(private readonly s3: S3Service) {
    super()
  }

  async loadLatestForOrg(
    organizationSlug: string,
  ): Promise<MeetingScheduleArtifact | null> {
    const run = await this.model.findFirst({
      where: {
        organizationSlug,
        experimentType: EXPERIMENT_TYPE,
        status: ExperimentRunStatus.COMPLETED,
        artifactBucket: { not: null },
        artifactKey: { not: null },
      },
      orderBy: { createdAt: Prisma.SortOrder.desc },
    })
    if (!run || !run.artifactBucket || !run.artifactKey) return null

    const raw = await this.s3.getFile(run.artifactBucket, run.artifactKey)
    if (!raw) return null

    try {
      const parsed = MeetingScheduleArtifactSchema.safeParse(JSON.parse(raw))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
}
