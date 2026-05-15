import { Injectable } from '@nestjs/common'
import {
  ArtifactFeedback as ArtifactFeedbackRow,
  ArtifactFeedbackKind,
  ArtifactResourceType,
  ElectedOffice,
} from '@prisma/client'
import { ArtifactFeedback as ArtifactFeedbackDTO } from '@goodparty_org/contracts'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { resolveBriefingId } from '@/meetings/util/resolveBriefingId'

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
  async listMineForBriefing(
    args: BriefingScope,
  ): Promise<ArtifactFeedbackDTO[]> {
    const { meetingDate, userId, electedOffice } = args
    const briefingId = await resolveBriefingId(
      this.client,
      meetingDate,
      electedOffice,
    )
    const rows = await this.client.artifactFeedback.findMany({
      where: {
        briefingId,
        submitterUserId: userId,
        artifactType: ArtifactResourceType.agenda_item,
      },
      orderBy: { updatedAt: 'desc' },
    })
    return rows.map(toDTO)
  }

  async setForItem(args: SetFeedbackArgs): Promise<ArtifactFeedbackDTO> {
    const { meetingDate, itemId, userId, electedOffice, feedback } = args
    const briefingId = await resolveBriefingId(
      this.client,
      meetingDate,
      electedOffice,
    )

    const row = await this.client.artifactFeedback.upsert({
      where: {
        submitterUserId_briefingId_artifactId_artifactType: {
          submitterUserId: userId,
          briefingId,
          artifactId: itemId,
          artifactType: ArtifactResourceType.agenda_item,
        },
      },
      create: {
        organizationSlug: electedOffice.organizationSlug,
        briefingId,
        submitterUserId: userId,
        artifactId: itemId,
        artifactType: ArtifactResourceType.agenda_item,
        feedback,
      },
      update: { feedback },
    })

    return toDTO(row)
  }

  async clearForItem(args: ItemScope): Promise<void> {
    const { meetingDate, itemId, userId, electedOffice } = args
    const briefingId = await resolveBriefingId(
      this.client,
      meetingDate,
      electedOffice,
    )
    await this.client.artifactFeedback.deleteMany({
      where: {
        briefingId,
        submitterUserId: userId,
        artifactId: itemId,
        artifactType: ArtifactResourceType.agenda_item,
      },
    })
  }
}
