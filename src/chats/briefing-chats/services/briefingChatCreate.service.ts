import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common'
import {
  Annotation,
  AnnotationKind,
  AnnotationResourceType,
} from '@prisma/client'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'
import { isUniqueConstraintError } from '@/prisma/util/prismaErrors.util'
import { parseIsoDateAsUTC } from '@/shared/util/date.util'

export interface BriefingChatAnchor {
  jsonPath: string | null
  start: number | null
  end: number | null
}

export interface FindOrCreateArgs {
  userId: number
  meetingDate: string
  anchor: BriefingChatAnchor
}

export interface FindOrCreateResult {
  annotationId: string
  conversationId: string
}

const isTopLevel = (anchor: BriefingChatAnchor): boolean =>
  anchor.jsonPath === null && anchor.start === null && anchor.end === null

const toResult = (annotation: Annotation): FindOrCreateResult => {
  if (annotation.chatConversationId === null) {
    throw new InternalServerErrorException(
      'Top-level chat annotation has no chat conversation',
    )
  }
  return {
    annotationId: annotation.id,
    conversationId: annotation.chatConversationId,
  }
}

@Injectable()
export class BriefingChatCreateService extends createPrismaBase(
  MODELS.Annotation,
) {
  async findOrCreate(args: FindOrCreateArgs): Promise<FindOrCreateResult> {
    const { userId, meetingDate, anchor } = args

    const briefing = await this.client.meetingBriefing.findFirst({
      where: {
        meetingDate: parseIsoDateAsUTC(meetingDate),
        electedOffice: { userId },
      },
      select: { id: true },
    })
    if (!briefing) {
      throw new NotFoundException('Briefing not found')
    }
    const briefingId = briefing.id

    if (!isTopLevel(anchor)) {
      return this.createPair(userId, briefingId, anchor)
    }

    const existing = await this.findTopLevel(userId, briefingId)
    if (existing) return toResult(existing)

    return this.createTopLevelOrRace(userId, briefingId, anchor)
  }

  private async createTopLevelOrRace(
    userId: number,
    briefingId: string,
    anchor: BriefingChatAnchor,
  ): Promise<FindOrCreateResult> {
    try {
      return await this.createPair(userId, briefingId, anchor)
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err
      const winner = await this.findTopLevel(userId, briefingId)
      if (winner) return toResult(winner)
      throw err
    }
  }

  private findTopLevel(
    userId: number,
    briefingId: string,
  ): Promise<Annotation | null> {
    return this.findFirst({
      where: {
        authorUserId: userId,
        resourceId: briefingId,
        resourceType: AnnotationResourceType.briefing,
        kind: AnnotationKind.chat,
        jsonPath: null,
      },
    })
  }

  private async createPair(
    userId: number,
    briefingId: string,
    anchor: BriefingChatAnchor,
  ): Promise<FindOrCreateResult> {
    return this.client.$transaction(async (tx) => {
      const conversation = await tx.chatConversation.create({
        data: { ownerUserId: userId },
      })
      const annotation = await tx.annotation.create({
        data: {
          authorUserId: userId,
          kind: AnnotationKind.chat,
          resourceId: briefingId,
          resourceType: AnnotationResourceType.briefing,
          jsonPath: anchor.jsonPath,
          start: anchor.start,
          end: anchor.end,
          chatConversationId: conversation.id,
        },
      })
      return { annotationId: annotation.id, conversationId: conversation.id }
    })
  }
}
