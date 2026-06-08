import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import {
  Annotation,
  AnnotationKind,
  AnnotationResourceType,
  MeetingBriefing,
} from '../../../generated/prisma'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'
import { BriefingArtifactCacheService } from './briefingArtifactCache.service'

export type BriefingArtifactContent = string

export interface BriefingContextUser {
  firstName: string | null
  lastName: string | null
}

export interface BriefingContextOffice {
  title: string | null
  jurisdiction: string | null
}

export interface BriefingContextResult {
  annotation: Annotation
  briefing: MeetingBriefing
  artifactContent: BriefingArtifactContent
  user: BriefingContextUser | null
  office: BriefingContextOffice | null
}

@Injectable()
export class BriefingContextService extends createPrismaBase(
  MODELS.Annotation,
) {
  constructor(private readonly artifactCache: BriefingArtifactCacheService) {
    super()
  }

  async loadContext(
    annotationId: string,
    userId: number,
  ): Promise<BriefingContextResult> {
    const annotation = await this.findFirst({
      where: { id: annotationId, authorUserId: userId },
    })
    if (!annotation) {
      this.logger.warn(
        { annotationId, userId },
        'briefing context rejected: annotation not found',
      )
      throw new NotFoundException('Annotation not found')
    }

    if (annotation.kind !== AnnotationKind.chat) {
      this.logger.warn(
        { annotationId, userId, kind: annotation.kind },
        'briefing context rejected: annotation kind is not chat',
      )
      throw new BadRequestException('Annotation is not a chat annotation')
    }
    if (annotation.resourceType !== AnnotationResourceType.briefing) {
      this.logger.warn(
        { annotationId, userId, resourceType: annotation.resourceType },
        'briefing context rejected: resource type is not briefing',
      )
      throw new BadRequestException(
        'Annotation does not reference a briefing resource',
      )
    }

    if (annotation.chatConversationId === null) {
      this.logger.warn(
        { annotationId, userId },
        'briefing context rejected: chat conversation id is null',
      )
      throw new NotFoundException('Annotation has no chat conversation')
    }

    const briefing = await this.client.meetingBriefing.findFirst({
      where: {
        id: annotation.resourceId,
        electedOffice: { userId },
      },
      include: {
        electedOffice: { include: { organization: true } },
      },
    })
    if (!briefing) {
      this.logger.warn(
        { annotationId, userId, resourceId: annotation.resourceId },
        'briefing context rejected: briefing not found or not owned by user',
      )
      throw new NotFoundException('Meeting briefing not found')
    }

    const [artifactContent, user] = await Promise.all([
      this.artifactCache.get(briefing.artifactBucket, briefing.artifactKey),
      this.loadUser(userId),
    ])
    const office = this.officeFromBriefing(briefing)

    return {
      annotation,
      briefing,
      artifactContent,
      user,
      office,
    }
  }

  private async loadUser(userId: number): Promise<BriefingContextUser | null> {
    const u = await this.client.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true },
    })
    if (!u) return null
    return { firstName: u.firstName, lastName: u.lastName }
  }

  private officeFromBriefing(briefing: {
    electedOffice: { organization: { customPositionName: string | null } }
  }): BriefingContextOffice {
    const customPositionName =
      briefing.electedOffice.organization.customPositionName
    return {
      title: customPositionName,
      jurisdiction: null,
    }
  }
}
