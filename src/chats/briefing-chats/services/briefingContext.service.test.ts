import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common'
import {
  AnnotationKind,
  AnnotationResourceType,
  ExperimentRunStatus,
} from '../../../generated/prisma'
import { beforeEach, describe, expect, it } from 'vitest'
import { PrismaService } from '@/prisma/prisma.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { useTestService } from '@/test-service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { BriefingArtifactCacheService } from './briefingArtifactCache.service'
import { BriefingContextService } from './briefingContext.service'

const service = useTestService()

const BRIEFINGS_BUCKET = 'briefings-bucket'
const HAPPY_PATH_KEY = 'happy/path.md'

class FakeS3Service {
  private store = new Map<string, string>()
  private errors = new Map<string, Error>()

  seed(bucket: string, key: string, body: string): void {
    this.store.set(`${bucket}/${key}`, body)
  }

  seedError(bucket: string, key: string, error: Error): void {
    this.errors.set(`${bucket}/${key}`, error)
  }

  getFile(bucket: string, key: string): Promise<string | undefined> {
    const id = `${bucket}/${key}`
    const err = this.errors.get(id)
    if (err) return Promise.reject(err)
    return Promise.resolve(this.store.get(id))
  }

  asService(): S3Service {
    return this as unknown as S3Service
  }
}

const createOrgAndElectedOffice = async (
  userId: number,
  orgOverrides?: { customPositionName?: string | null },
) => {
  const org = await service.prisma.organization.create({
    data: {
      slug: `org-${Math.random().toString(36).slice(2, 10)}`,
      ownerId: userId,
      ...(orgOverrides?.customPositionName !== undefined && {
        customPositionName: orgOverrides.customPositionName,
      }),
    },
  })
  const electedOffice = await service.prisma.electedOffice.create({
    data: {
      organizationSlug: org.slug,
      userId,
    },
  })
  return { org, electedOffice }
}

const createExperimentRun = async (organizationSlug: string) =>
  service.prisma.experimentRun.create({
    data: {
      organizationSlug,
      experimentType: 'meeting_briefing',
      status: ExperimentRunStatus.COMPLETED,
    },
  })

const createBriefing = async (params: {
  electedOfficeId: string
  experimentRunId: string
  artifactBucket: string
  artifactKey: string
  meetingDate?: Date
}) =>
  service.prisma.meetingBriefing.create({
    data: {
      electedOfficeId: params.electedOfficeId,
      experimentRunId: params.experimentRunId,
      artifactBucket: params.artifactBucket,
      artifactKey: params.artifactKey,
      meetingDate: params.meetingDate ?? new Date('2026-06-01T00:00:00Z'),
      meetingTime: '18:00',
      meetingTimezone: 'America/New_York',
    },
  })

const createConversation = async (ownerUserId: number) =>
  service.prisma.chatConversation.create({
    data: { ownerUserId },
  })

const createAnnotation = async (params: {
  authorUserId: number
  kind: AnnotationKind
  resourceId: string
  resourceType?: AnnotationResourceType
  chatConversationId?: string | null
}) =>
  service.prisma.annotation.create({
    data: {
      authorUserId: params.authorUserId,
      kind: params.kind,
      resourceId: params.resourceId,
      resourceType: params.resourceType ?? AnnotationResourceType.briefing,
      chatConversationId: params.chatConversationId ?? null,
    },
  })

describe('BriefingContextService', () => {
  let s3: FakeS3Service
  let ctx: BriefingContextService

  beforeEach(() => {
    const prisma = service.app.get(PrismaService)
    s3 = new FakeS3Service()
    const cache = new BriefingArtifactCacheService(
      s3.asService(),
      createMockLogger(),
    )
    ctx = new BriefingContextService(cache)
    Object.defineProperty(ctx, '_prisma', {
      get: () => prisma,
      configurable: true,
    })
    Object.defineProperty(ctx, 'logger', {
      get: () => createMockLogger(),
      configurable: true,
    })
    ctx.onModuleInit()
  })

  describe('annotation lookup', () => {
    it('throws NotFoundException when annotation id does not exist', async () => {
      await expect(
        ctx.loadContext('nonexistent', service.user.id),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws NotFoundException when authorUserId mismatches (IDOR)', async () => {
      const other = await service.prisma.user.create({
        data: {
          id: 999,
          email: 'other@goodparty.org',
          firstName: 'Other',
          lastName: 'Person',
        },
      })
      const { electedOffice } = await createOrgAndElectedOffice(other.id)
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: 'bucket-a',
        artifactKey: 'key-a',
      })
      const convo = await createConversation(other.id)
      const annotation = await createAnnotation({
        authorUserId: other.id,
        kind: AnnotationKind.chat,
        resourceId: briefing.id,
        chatConversationId: convo.id,
      })

      await expect(
        ctx.loadContext(annotation.id, service.user.id),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('kind/resource validation', () => {
    it('throws BadRequestException when annotation.kind is note', async () => {
      const { electedOffice } = await createOrgAndElectedOffice(service.user.id)
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: 'bucket-a',
        artifactKey: 'key-a',
      })
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.note,
        resourceId: briefing.id,
      })

      await expect(
        ctx.loadContext(annotation.id, service.user.id),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws BadRequestException when annotation.kind is bug_report', async () => {
      const { electedOffice } = await createOrgAndElectedOffice(service.user.id)
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: 'bucket-a',
        artifactKey: 'key-a',
      })
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.bug_report,
        resourceId: briefing.id,
      })

      await expect(
        ctx.loadContext(annotation.id, service.user.id),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws NotFoundException when annotation.chatConversationId is null', async () => {
      const { electedOffice } = await createOrgAndElectedOffice(service.user.id)
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: 'bucket-a',
        artifactKey: 'key-a',
      })
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: briefing.id,
        chatConversationId: null,
      })

      await expect(
        ctx.loadContext(annotation.id, service.user.id),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('briefing lookup', () => {
    it('throws NotFoundException when resourceId points at a nonexistent briefing', async () => {
      const convo = await createConversation(service.user.id)
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: 'does-not-exist-briefing-id',
        chatConversationId: convo.id,
      })

      await expect(
        ctx.loadContext(annotation.id, service.user.id),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws NotFoundException when briefing belongs to another user', async () => {
      const other = await service.prisma.user.create({
        data: {
          id: 1001,
          email: 'cross-tenant@goodparty.org',
          firstName: 'Cross',
          lastName: 'Tenant',
        },
      })
      const { electedOffice: otherOffice } = await createOrgAndElectedOffice(
        other.id,
      )
      const otherRun = await createExperimentRun(otherOffice.organizationSlug)
      const otherBriefing = await createBriefing({
        electedOfficeId: otherOffice.id,
        experimentRunId: otherRun.runId,
        artifactBucket: BRIEFINGS_BUCKET,
        artifactKey: 'leaked.md',
      })
      const convo = await createConversation(service.user.id)
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: otherBriefing.id,
        chatConversationId: convo.id,
      })
      s3.seed(BRIEFINGS_BUCKET, 'leaked.md', 'should-not-be-served')

      await expect(
        ctx.loadContext(annotation.id, service.user.id),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('S3 fetch', () => {
    it('returns artifact content as utf-8 string when bucket+key exist', async () => {
      const { electedOffice } = await createOrgAndElectedOffice(service.user.id)
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: BRIEFINGS_BUCKET,
        artifactKey: 'path/to/briefing.md',
      })
      const convo = await createConversation(service.user.id)
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: briefing.id,
        chatConversationId: convo.id,
      })
      const expected = '# Meeting Briefing\n\nFull text here.'
      s3.seed(BRIEFINGS_BUCKET, 'path/to/briefing.md', expected)

      const result = await ctx.loadContext(annotation.id, service.user.id)

      expect(result.artifactContent).toBe(expected)
    })

    it('throws NotFoundException when S3 returns no object for the key', async () => {
      const { electedOffice } = await createOrgAndElectedOffice(service.user.id)
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: BRIEFINGS_BUCKET,
        artifactKey: 'missing.md',
      })
      const convo = await createConversation(service.user.id)
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: briefing.id,
        chatConversationId: convo.id,
      })

      await expect(
        ctx.loadContext(annotation.id, service.user.id),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws BadGatewayException when S3 throws a generic error', async () => {
      const { electedOffice } = await createOrgAndElectedOffice(service.user.id)
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: BRIEFINGS_BUCKET,
        artifactKey: 'broken.md',
      })
      const convo = await createConversation(service.user.id)
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: briefing.id,
        chatConversationId: convo.id,
      })
      s3.seedError(BRIEFINGS_BUCKET, 'broken.md', new Error('connection reset'))

      await expect(
        ctx.loadContext(annotation.id, service.user.id),
      ).rejects.toBeInstanceOf(BadGatewayException)
    })
  })

  describe('happy path', () => {
    it('returns annotation, briefing, and artifactContent populated correctly', async () => {
      const { electedOffice } = await createOrgAndElectedOffice(service.user.id)
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: BRIEFINGS_BUCKET,
        artifactKey: HAPPY_PATH_KEY,
      })
      const convo = await createConversation(service.user.id)
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: briefing.id,
        chatConversationId: convo.id,
      })
      const expected = 'happy path content'
      s3.seed(BRIEFINGS_BUCKET, HAPPY_PATH_KEY, expected)

      const result = await ctx.loadContext(annotation.id, service.user.id)

      expect(result.annotation.id).toBe(annotation.id)
      expect(result.annotation.authorUserId).toBe(service.user.id)
      expect(result.annotation.chatConversationId).toBe(convo.id)
      expect(result.briefing.id).toBe(briefing.id)
      expect(result.briefing.artifactBucket).toBe(BRIEFINGS_BUCKET)
      expect(result.briefing.artifactKey).toBe(HAPPY_PATH_KEY)
      expect(result.artifactContent).toBe(expected)
    })
  })

  describe('user + office extension', () => {
    it('returns user firstName + lastName for the authenticated user', async () => {
      const { electedOffice } = await createOrgAndElectedOffice(service.user.id)
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: BRIEFINGS_BUCKET,
        artifactKey: HAPPY_PATH_KEY,
      })
      const convo = await createConversation(service.user.id)
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: briefing.id,
        chatConversationId: convo.id,
      })
      s3.seed(BRIEFINGS_BUCKET, HAPPY_PATH_KEY, 'body')

      const result = await ctx.loadContext(annotation.id, service.user.id)

      expect(result.user).not.toBeNull()
      expect(result.user?.firstName).toBe(service.user.firstName)
      expect(result.user?.lastName).toBe(service.user.lastName)
    })

    it('returns office.title from organization.customPositionName', async () => {
      const { electedOffice } = await createOrgAndElectedOffice(
        service.user.id,
        { customPositionName: 'City Council Member' },
      )
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: BRIEFINGS_BUCKET,
        artifactKey: HAPPY_PATH_KEY,
      })
      const convo = await createConversation(service.user.id)
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: briefing.id,
        chatConversationId: convo.id,
      })
      s3.seed(BRIEFINGS_BUCKET, HAPPY_PATH_KEY, 'body')

      const result = await ctx.loadContext(annotation.id, service.user.id)

      expect(result.office).not.toBeNull()
      expect(result.office?.title).toBe('City Council Member')
    })

    it('returns office with null title when no customPositionName is set', async () => {
      const { electedOffice } = await createOrgAndElectedOffice(service.user.id)
      const run = await createExperimentRun(electedOffice.organizationSlug)
      const briefing = await createBriefing({
        electedOfficeId: electedOffice.id,
        experimentRunId: run.runId,
        artifactBucket: BRIEFINGS_BUCKET,
        artifactKey: HAPPY_PATH_KEY,
      })
      const convo = await createConversation(service.user.id)
      const annotation = await createAnnotation({
        authorUserId: service.user.id,
        kind: AnnotationKind.chat,
        resourceId: briefing.id,
        chatConversationId: convo.id,
      })
      s3.seed(BRIEFINGS_BUCKET, HAPPY_PATH_KEY, 'body')

      const result = await ctx.loadContext(annotation.id, service.user.id)

      expect(result.office).not.toBeNull()
      expect(result.office?.title).toBeNull()
      expect(result.office?.jurisdiction).toBeNull()
    })
  })
})
