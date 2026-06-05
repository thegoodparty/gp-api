import { InternalServerErrorException, NotFoundException } from '@nestjs/common'
import {
  AnnotationKind,
  AnnotationResourceType,
  ExperimentRunStatus,
  User,
} from '../../../generated/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTestService } from '@/test-service'
import { BriefingChatCreateService } from './briefingChatCreate.service'

const service = useTestService()

const BRIEFING_BUCKET = 'briefings-bucket'
const BRIEFING_KEY = 'create/briefing.md'
const MEETING_DATE = '2026-06-01'

const createBriefingForUser = async (
  userId: number,
  meetingDate: string = MEETING_DATE,
): Promise<{ briefingId: string; meetingDate: string }> => {
  const slug = `org-${userId}-${Math.random().toString(36).slice(2, 10)}`
  await service.prisma.organization.create({
    data: { slug, ownerId: userId },
  })
  const electedOffice = await service.prisma.electedOffice.create({
    data: { organizationSlug: slug, userId },
  })
  const run = await service.prisma.experimentRun.create({
    data: {
      organizationSlug: slug,
      experimentType: 'meeting_briefing',
      status: ExperimentRunStatus.COMPLETED,
    },
  })
  const briefing = await service.prisma.meetingBriefing.create({
    data: {
      electedOfficeId: electedOffice.id,
      experimentRunId: run.runId,
      artifactBucket: BRIEFING_BUCKET,
      artifactKey: BRIEFING_KEY,
      meetingDate: new Date(`${meetingDate}T00:00:00Z`),
      meetingTime: '18:00',
      meetingTimezone: 'America/New_York',
    },
  })
  return { briefingId: briefing.id, meetingDate }
}

const createOtherUser = async (suffix: string): Promise<User> =>
  service.prisma.user.create({
    data: {
      email: `other-${suffix}@goodparty.org`,
      firstName: 'Other',
      lastName: 'User',
    },
  })

const TOP_LEVEL_ANCHOR = {
  jsonPath: null,
  start: null,
  end: null,
}

const ANCHORED = {
  jsonPath: '$.foo',
  start: 10,
  end: 20,
}

describe('BriefingChatCreateService.findOrCreate', () => {
  let svc: BriefingChatCreateService

  beforeEach(() => {
    svc = service.app.get(BriefingChatCreateService)
  })

  it('top-level: creates a new annotation + conversation on first call', async () => {
    const { briefingId, meetingDate } = await createBriefingForUser(
      service.user.id,
    )

    const result = await svc.findOrCreate({
      userId: service.user.id,
      meetingDate,
      anchor: TOP_LEVEL_ANCHOR,
    })

    expect(result.annotationId).toBeTruthy()
    expect(result.conversationId).toBeTruthy()

    const annotation = await service.prisma.annotation.findUnique({
      where: { id: result.annotationId },
    })
    expect(annotation).not.toBeNull()
    expect(annotation?.authorUserId).toBe(service.user.id)
    expect(annotation?.resourceId).toBe(briefingId)
    expect(annotation?.resourceType).toBe(AnnotationResourceType.briefing)
    expect(annotation?.kind).toBe(AnnotationKind.chat)
    expect(annotation?.jsonPath).toBeNull()
    expect(annotation?.start).toBeNull()
    expect(annotation?.end).toBeNull()
    expect(annotation?.chatConversationId).toBe(result.conversationId)

    const conv = await service.prisma.chatConversation.findUnique({
      where: { id: result.conversationId },
    })
    expect(conv?.ownerUserId).toBe(service.user.id)
  })

  it('top-level: second call returns the same ids (find-or-create)', async () => {
    const { meetingDate } = await createBriefingForUser(service.user.id)

    const first = await svc.findOrCreate({
      userId: service.user.id,
      meetingDate,
      anchor: TOP_LEVEL_ANCHOR,
    })
    const second = await svc.findOrCreate({
      userId: service.user.id,
      meetingDate,
      anchor: TOP_LEVEL_ANCHOR,
    })

    expect(second.annotationId).toBe(first.annotationId)
    expect(second.conversationId).toBe(first.conversationId)
  })

  it('top-level: different user with same meetingDate creates a new annotation', async () => {
    const { meetingDate } = await createBriefingForUser(service.user.id)
    const other = await createOtherUser('top-level-scope')
    const { meetingDate: otherMeetingDate } = await createBriefingForUser(
      other.id,
    )

    const a = await svc.findOrCreate({
      userId: service.user.id,
      meetingDate,
      anchor: TOP_LEVEL_ANCHOR,
    })
    const b = await svc.findOrCreate({
      userId: other.id,
      meetingDate: otherMeetingDate,
      anchor: TOP_LEVEL_ANCHOR,
    })

    expect(b.annotationId).not.toBe(a.annotationId)
    expect(b.conversationId).not.toBe(a.conversationId)
  })

  it('anchored: always creates a new annotation, even on repeat', async () => {
    const { meetingDate } = await createBriefingForUser(service.user.id)

    const first = await svc.findOrCreate({
      userId: service.user.id,
      meetingDate,
      anchor: ANCHORED,
    })
    const second = await svc.findOrCreate({
      userId: service.user.id,
      meetingDate,
      anchor: ANCHORED,
    })

    expect(second.annotationId).not.toBe(first.annotationId)
    expect(second.conversationId).not.toBe(first.conversationId)
  })

  it('throws NotFoundException when briefing belongs to a different user', async () => {
    const other = await createOtherUser('not-owner')
    const { meetingDate: foreignMeetingDate } = await createBriefingForUser(
      other.id,
    )

    await expect(
      svc.findOrCreate({
        userId: service.user.id,
        meetingDate: foreignMeetingDate,
        anchor: TOP_LEVEL_ANCHOR,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('throws NotFoundException when briefing does not exist', async () => {
    await expect(
      svc.findOrCreate({
        userId: service.user.id,
        meetingDate: '2099-01-01',
        anchor: TOP_LEVEL_ANCHOR,
      }),
    ).rejects.toBeInstanceOf(NotFoundException)
  })

  it('top-level: concurrent findOrCreate calls converge on a single annotation', async () => {
    const { briefingId, meetingDate } = await createBriefingForUser(
      service.user.id,
    )

    const [a, b] = await Promise.all([
      svc.findOrCreate({
        userId: service.user.id,
        meetingDate,
        anchor: TOP_LEVEL_ANCHOR,
      }),
      svc.findOrCreate({
        userId: service.user.id,
        meetingDate,
        anchor: TOP_LEVEL_ANCHOR,
      }),
    ])

    expect(a.annotationId).toBe(b.annotationId)
    expect(a.conversationId).toBe(b.conversationId)

    const rows = await service.prisma.annotation.findMany({
      where: {
        authorUserId: service.user.id,
        resourceId: briefingId,
        resourceType: AnnotationResourceType.briefing,
        kind: AnnotationKind.chat,
        jsonPath: null,
      },
    })
    expect(rows).toHaveLength(1)
  })

  it('top-level: orphan ChatConversation rows from a losing race are cleaned up by the loser branch', async () => {
    const { briefingId, meetingDate } = await createBriefingForUser(
      service.user.id,
    )

    await Promise.all([
      svc.findOrCreate({
        userId: service.user.id,
        meetingDate,
        anchor: TOP_LEVEL_ANCHOR,
      }),
      svc.findOrCreate({
        userId: service.user.id,
        meetingDate,
        anchor: TOP_LEVEL_ANCHOR,
      }),
    ])

    const annotations = await service.prisma.annotation.findMany({
      where: {
        authorUserId: service.user.id,
        resourceId: briefingId,
        resourceType: AnnotationResourceType.briefing,
        kind: AnnotationKind.chat,
        jsonPath: null,
      },
    })
    expect(annotations).toHaveLength(1)
  })

  it('top-level: after softDelete, a subsequent findOrCreate mints a NEW pair', async () => {
    const { meetingDate } = await createBriefingForUser(service.user.id)

    const first = await svc.findOrCreate({
      userId: service.user.id,
      meetingDate,
      anchor: TOP_LEVEL_ANCHOR,
    })

    await service.prisma.$transaction(async (tx) => {
      await tx.chatConversation.update({
        where: { id: first.conversationId },
        data: { deletedAt: new Date() },
      })
      await tx.annotation.deleteMany({
        where: { chatConversationId: first.conversationId },
      })
    })

    const second = await svc.findOrCreate({
      userId: service.user.id,
      meetingDate,
      anchor: TOP_LEVEL_ANCHOR,
    })

    expect(second.annotationId).not.toBe(first.annotationId)
    expect(second.conversationId).not.toBe(first.conversationId)
  })

  it('anchored: after softDelete, a subsequent findOrCreate mints a new pair', async () => {
    const { meetingDate } = await createBriefingForUser(service.user.id)

    const first = await svc.findOrCreate({
      userId: service.user.id,
      meetingDate,
      anchor: ANCHORED,
    })

    await service.prisma.$transaction(async (tx) => {
      await tx.chatConversation.update({
        where: { id: first.conversationId },
        data: { deletedAt: new Date() },
      })
      await tx.annotation.deleteMany({
        where: { chatConversationId: first.conversationId },
      })
    })

    const second = await svc.findOrCreate({
      userId: service.user.id,
      meetingDate,
      anchor: ANCHORED,
    })

    expect(second.annotationId).not.toBe(first.annotationId)
    expect(second.conversationId).not.toBe(first.conversationId)
  })

  it('top-level: throws InternalServerError if existing annotation has null chatConversationId', async () => {
    const { briefingId, meetingDate } = await createBriefingForUser(
      service.user.id,
    )

    await service.prisma.annotation.create({
      data: {
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: briefingId,
        resourceType: AnnotationResourceType.briefing,
        chatConversationId: null,
      },
    })

    await expect(
      svc.findOrCreate({
        userId: service.user.id,
        meetingDate,
        anchor: TOP_LEVEL_ANCHOR,
      }),
    ).rejects.toBeInstanceOf(InternalServerErrorException)
  })
})
