import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  ArtifactFeedback as ArtifactFeedbackRow,
  ArtifactFeedbackKind,
  ArtifactResourceType,
  ElectedOffice,
  Prisma,
} from '@prisma/client'
import { ArtifactFeedback as ArtifactFeedbackDTO } from '@goodparty_org/contracts'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'

type BriefingScope = {
  meetingDate: string
  userId: number
  electedOffice: ElectedOffice
}

type ItemScope = BriefingScope & { itemId: string }

type SetFeedbackArgs = ItemScope & { feedback: ArtifactFeedbackKind }

function toDTO(row: ArtifactFeedbackRow): ArtifactFeedbackDTO {
  return {
    id: row.id,
    organization_slug: row.organizationSlug,
    submitter_user_id: row.submitterUserId,
    artifact_type: row.artifactType,
    artifact_id: row.artifactId,
    feedback: row.feedback,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

@Injectable()
export class ArtifactFeedbackService extends createPrismaBase(
  MODELS.ArtifactFeedback,
) {
  private async resolveBriefingId(
    meetingDate: string,
    electedOffice: ElectedOffice,
  ): Promise<string> {
    const briefing = await this.client.meetingBriefing.findUnique({
      where: {
        electedOfficeId_meetingDate: {
          electedOfficeId: electedOffice.id,
          meetingDate: parseIsoDateAsUTC(meetingDate),
        },
      },
      select: { id: true },
    })
    if (!briefing) throw new NotFoundException('briefing_not_found')
    return briefing.id
  }

  async listMineForBriefing(
    args: BriefingScope,
  ): Promise<ArtifactFeedbackDTO[]> {
    const { meetingDate, userId, electedOffice } = args
    await this.resolveBriefingId(meetingDate, electedOffice)
    const rows = await this.client.artifactFeedback.findMany({
      where: {
        organizationSlug: electedOffice.organizationSlug,
        submitterUserId: userId,
        artifactType: ArtifactResourceType.agenda_item,
      },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map(toDTO)
  }

  async setForItem(args: SetFeedbackArgs): Promise<ArtifactFeedbackDTO> {
    const { meetingDate, itemId, userId, electedOffice, feedback } = args
    await this.resolveBriefingId(meetingDate, electedOffice)

    const row = await this.client.$transaction(
      async (tx) => {
        return tx.artifactFeedback.upsert({
          where: {
            submitterUserId_artifactId_artifactType: {
              submitterUserId: userId,
              artifactId: itemId,
              artifactType: ArtifactResourceType.agenda_item,
            },
          },
          create: {
            organizationSlug: electedOffice.organizationSlug,
            submitterUserId: userId,
            artifactId: itemId,
            artifactType: ArtifactResourceType.agenda_item,
            feedback,
          },
          update: {
            feedback,
            organizationSlug: electedOffice.organizationSlug,
          },
        })
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    )

    if (row.organizationSlug !== electedOffice.organizationSlug) {
      throw new ForbiddenException('feedback_not_accessible')
    }
    return toDTO(row)
  }

  async clearForItem(args: ItemScope): Promise<void> {
    const { meetingDate, itemId, userId, electedOffice } = args
    await this.resolveBriefingId(meetingDate, electedOffice)
    await this.client.artifactFeedback.deleteMany({
      where: {
        organizationSlug: electedOffice.organizationSlug,
        submitterUserId: userId,
        artifactId: itemId,
        artifactType: ArtifactResourceType.agenda_item,
      },
    })
  }
}
