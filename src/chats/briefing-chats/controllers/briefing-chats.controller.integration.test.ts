import { HttpStatus } from '@nestjs/common'
import {
  Annotation,
  AnnotationKind,
  AnnotationResourceType,
  ChatConversation,
  ChatMessageRole,
  ElectedOffice,
  ExperimentRunStatus,
  MeetingBriefing,
  User,
} from '../../../generated/prisma'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ChatStreamChunk,
  ChatStreamService,
} from '@/chats/services/chatStream.service'
import { ChatStoreService } from '@/chats/services/chatStore.prisma'
import { useTestService } from '@/test-service'
import { S3Service } from '@/vendors/aws/services/s3.service'

const service = useTestService()

const BRIEFING_BUCKET = 'briefings-bucket'
const BRIEFING_KEY = 'integration/briefing.md'
const ARTIFACT_CONTENT = '# Briefing\n\nbody'
const MEETING_DATE = '2026-06-01'

interface Fixtures {
  electedOffice: ElectedOffice
  briefing: MeetingBriefing
  conversation: ChatConversation
  annotation: Annotation
}

const createOrgAndElectedOffice = async (userId: number) => {
  const slug = `org-${userId}-${Math.random().toString(36).slice(2, 10)}`
  await service.prisma.organization.create({
    data: { slug, ownerId: userId },
  })
  const electedOffice = await service.prisma.electedOffice.create({
    data: { organizationSlug: slug, userId },
  })
  return { slug, electedOffice }
}

const createBriefingFixtures = async (
  userId: number,
  meetingDate: string = MEETING_DATE,
): Promise<Fixtures> => {
  const { slug, electedOffice } = await createOrgAndElectedOffice(userId)
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
  const conversation = await service.prisma.chatConversation.create({
    data: { ownerUserId: userId },
  })
  const annotation = await service.prisma.annotation.create({
    data: {
      authorUserId: userId,
      kind: AnnotationKind.chat,
      resourceId: briefing.id,
      resourceType: AnnotationResourceType.briefing,
      chatConversationId: conversation.id,
    },
  })
  return { electedOffice, briefing, conversation, annotation }
}

const createOtherUser = async (suffix: string): Promise<User> =>
  service.prisma.user.create({
    data: {
      email: `other-${suffix}@goodparty.org`,
      firstName: 'Other',
      lastName: 'User',
    },
  })

const buildStream = (
  chunks: ChatStreamChunk[],
  hook?: () => Promise<void> | void,
): AsyncIterable<ChatStreamChunk> => ({
  [Symbol.asyncIterator]: async function* () {
    if (hook) await hook()
    for (const c of chunks) yield c
  },
})

const parseSseFrames = (
  body: string,
): Array<{ raw: string; parsed: unknown }> => {
  const frames: Array<{ raw: string; parsed: unknown }> = []
  const parts = body.split('\n\n').filter((p) => p.startsWith('data: '))
  for (const part of parts) {
    const raw = part.slice('data: '.length)
    frames.push({ raw, parsed: JSON.parse(raw) as unknown })
  }
  return frames
}

describe('BriefingChatsController (integration)', () => {
  let fixtures: Fixtures
  let chatStream: ChatStreamService
  let chatStore: ChatStoreService
  let s3: S3Service

  beforeEach(async () => {
    fixtures = await createBriefingFixtures(service.user.id)

    chatStream = service.app.get(ChatStreamService)
    chatStore = service.app.get(ChatStoreService)
    s3 = service.app.get(S3Service)

    vi.spyOn(s3, 'getFile').mockResolvedValue(ARTIFACT_CONTENT)

    vi.spyOn(chatStream, 'stream').mockImplementation((args) =>
      buildStream(
        [
          { type: 'text', delta: 'hello' },
          { type: 'done', assistantMessageId: 'asst-1' },
        ],
        async () => {
          await chatStore.appendMessage({
            conversationId: args.conversationId,
            role: ChatMessageRole.user,
            content: args.userMessage,
            ...(args.clientMessageId && {
              clientMessageId: args.clientMessageId,
            }),
          })
        },
      ),
    )
  })

  describe('POST /v1/briefing-chats', () => {
    it('creates a top-level chat and returns annotationId + conversationId', async () => {
      const res = await service.client.post('/v1/briefing-chats', {
        meetingDate: MEETING_DATE,
        anchor: { jsonPath: null, start: null, end: null },
      })

      expect(res.status).toBe(HttpStatus.CREATED)
      const body = res.data as {
        annotationId: string
        conversationId: string
      }
      expect(typeof body.annotationId).toBe('string')
      expect(typeof body.conversationId).toBe('string')

      const annotation = await service.prisma.annotation.findUnique({
        where: { id: body.annotationId },
      })
      expect(annotation?.chatConversationId).toBe(body.conversationId)
      expect(annotation?.jsonPath).toBeNull()
    })

    it('returns the same ids on repeated top-level calls (idempotent)', async () => {
      const first = await service.client.post('/v1/briefing-chats', {
        meetingDate: MEETING_DATE,
        anchor: { jsonPath: null, start: null, end: null },
      })
      const second = await service.client.post('/v1/briefing-chats', {
        meetingDate: MEETING_DATE,
        anchor: { jsonPath: null, start: null, end: null },
      })

      expect(second.data.annotationId).toBe(first.data.annotationId)
      expect(second.data.conversationId).toBe(first.data.conversationId)
    })

    it('creates distinct rows for repeated anchored calls', async () => {
      const first = await service.client.post('/v1/briefing-chats', {
        meetingDate: MEETING_DATE,
        anchor: { jsonPath: '$.a', start: 1, end: 5 },
      })
      const second = await service.client.post('/v1/briefing-chats', {
        meetingDate: MEETING_DATE,
        anchor: { jsonPath: '$.a', start: 1, end: 5 },
      })

      expect(second.data.annotationId).not.toBe(first.data.annotationId)
    })

    it('returns 401 when Authorization is invalid', async () => {
      const res = await service.client.post(
        '/v1/briefing-chats',
        {
          meetingDate: MEETING_DATE,
          anchor: { jsonPath: null, start: null, end: null },
        },
        { headers: { Authorization: 'Bearer invalid' } },
      )

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED)
    })

    it('returns 400 on mixed-nullness anchor', async () => {
      const res = await service.client.post('/v1/briefing-chats', {
        meetingDate: MEETING_DATE,
        anchor: { jsonPath: '$.foo', start: null, end: 10 },
      })

      expect(res.status).toBe(HttpStatus.BAD_REQUEST)
    })

    it('returns 400 on invalid meetingDate format', async () => {
      const res = await service.client.post('/v1/briefing-chats', {
        meetingDate: 'not-a-date',
        anchor: { jsonPath: null, start: null, end: null },
      })

      expect(res.status).toBe(HttpStatus.BAD_REQUEST)
    })

    it('returns 404 when no briefing exists for that meetingDate', async () => {
      const res = await service.client.post('/v1/briefing-chats', {
        meetingDate: '2099-01-01',
        anchor: { jsonPath: null, start: null, end: null },
      })

      expect(res.status).toBe(HttpStatus.NOT_FOUND)
    })

    it('returns 404 when briefing on that date belongs to another user (IDOR)', async () => {
      const other = await createOtherUser('post-create-idor')
      const otherMeetingDate = '2026-07-15'
      await createBriefingFixtures(other.id, otherMeetingDate)

      const res = await service.client.post('/v1/briefing-chats', {
        meetingDate: otherMeetingDate,
        anchor: { jsonPath: null, start: null, end: null },
      })

      expect(res.status).toBe(HttpStatus.NOT_FOUND)
    })
  })

  describe('POST /v1/briefing-chats/:annotationId/messages', () => {
    it('returns SSE response with JSON-framed chunks', async () => {
      const res = await service.client.post(
        `/v1/briefing-chats/${fixtures.annotation.id}/messages`,
        { content: 'hi there' },
      )

      expect(res.status).toBe(HttpStatus.OK)
      expect(String(res.headers['content-type'] ?? '')).toContain(
        'text/event-stream',
      )
      const frames = parseSseFrames(String(res.data))
      expect(frames.length).toBeGreaterThanOrEqual(1)
      const first = frames[0].parsed as { type?: string }
      expect(typeof first.type).toBe('string')
    })

    it('persists the user message visible via GET', async () => {
      await service.client.post(
        `/v1/briefing-chats/${fixtures.annotation.id}/messages`,
        { content: 'persisted message' },
      )

      const res = await service.client.get(
        `/v1/briefing-chats/${fixtures.annotation.id}`,
      )

      expect(res.status).toBe(HttpStatus.OK)
      const userMessages = (
        res.data.messages as Array<{ role: string; content: string }>
      ).filter((m) => m.role === ChatMessageRole.user)
      expect(userMessages).toHaveLength(1)
      expect(userMessages[0].content).toBe('persisted message')
    })

    it('returns 401 when Authorization is invalid', async () => {
      const res = await service.client.post(
        `/v1/briefing-chats/${fixtures.annotation.id}/messages`,
        { content: 'hi' },
        { headers: { Authorization: 'Bearer invalid' } },
      )

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED)
    })

    it('does not deliver chunks for an annotation owned by another user', async () => {
      const other = await createOtherUser('post-idor')
      const otherFixtures = await createBriefingFixtures(other.id)

      const res = await service.client.post(
        `/v1/briefing-chats/${otherFixtures.annotation.id}/messages`,
        { content: 'hi' },
      )

      expect(res.status).toBe(HttpStatus.NOT_FOUND)
      const frames = parseSseFrames(String(res.data))
      expect(
        frames.find((f) => (f.parsed as { type?: string }).type === 'done'),
      ).toBeUndefined()
      expect(
        frames.find((f) => (f.parsed as { type?: string }).type === 'text'),
      ).toBeUndefined()
      const otherMessages = await service.prisma.chatMessage.findMany({
        where: { conversationId: otherFixtures.conversation.id },
      })
      expect(otherMessages).toHaveLength(0)
    })

    it('returns 400 and does not invoke chat stream when content is empty', async () => {
      const streamSpy = vi.spyOn(chatStream, 'stream')
      streamSpy.mockClear()

      const res = await service.client.post(
        `/v1/briefing-chats/${fixtures.annotation.id}/messages`,
        { content: '' },
      )

      expect(res.status).toBe(HttpStatus.BAD_REQUEST)
      expect(streamSpy).not.toHaveBeenCalled()
      const messages = await service.prisma.chatMessage.findMany({
        where: { conversationId: fixtures.conversation.id },
      })
      expect(messages).toHaveLength(0)
    })

    it('returns 400 and does not invoke chat stream when content exceeds 10000 chars', async () => {
      const streamSpy = vi.spyOn(chatStream, 'stream')
      streamSpy.mockClear()

      const res = await service.client.post(
        `/v1/briefing-chats/${fixtures.annotation.id}/messages`,
        { content: 'x'.repeat(10_001) },
      )

      expect(res.status).toBe(HttpStatus.BAD_REQUEST)
      expect(streamSpy).not.toHaveBeenCalled()
      const messages = await service.prisma.chatMessage.findMany({
        where: { conversationId: fixtures.conversation.id },
      })
      expect(messages).toHaveLength(0)
    })

    it('returns 400 and does not invoke chat stream when body has no content field', async () => {
      const streamSpy = vi.spyOn(chatStream, 'stream')
      streamSpy.mockClear()

      const res = await service.client.post(
        `/v1/briefing-chats/${fixtures.annotation.id}/messages`,
        {},
      )

      expect(res.status).toBe(HttpStatus.BAD_REQUEST)
      expect(streamSpy).not.toHaveBeenCalled()
      const messages = await service.prisma.chatMessage.findMany({
        where: { conversationId: fixtures.conversation.id },
      })
      expect(messages).toHaveLength(0)
    })

    it('returns 404 for a malformed annotationId', async () => {
      const res = await service.client.post(
        '/v1/briefing-chats/not-a-valid-id/messages',
        { content: 'hi' },
      )

      expect(res.status).toBe(HttpStatus.NOT_FOUND)
      const frames = parseSseFrames(String(res.data))
      expect(
        frames.find((f) => (f.parsed as { type?: string }).type === 'done'),
      ).toBeUndefined()
    })

    it('persists only one user message when clientMessageId is repeated', async () => {
      const clientMessageId = '11111111-1111-1111-1111-111111111111'
      const content = 'idempotent message'

      const first = await service.client.post(
        `/v1/briefing-chats/${fixtures.annotation.id}/messages`,
        { content, clientMessageId },
      )
      const second = await service.client.post(
        `/v1/briefing-chats/${fixtures.annotation.id}/messages`,
        { content, clientMessageId },
      )

      expect(first.status).toBe(HttpStatus.OK)
      expect(second.status).toBe(HttpStatus.OK)
      const userMessages = await service.prisma.chatMessage.findMany({
        where: {
          conversationId: fixtures.conversation.id,
          role: ChatMessageRole.user,
        },
      })
      expect(userMessages).toHaveLength(1)
      expect(userMessages[0].content).toBe(content)
      expect(userMessages[0].clientMessageId).toBe(clientMessageId)
    })

    it('rejects a clientMessageId reused with different content (mid-stream conflict)', async () => {
      // The chatStore enforces clientMessageId+content uniqueness by throwing
      // ConflictException from appendMessage. By the time that runs the SSE
      // response has already been opened (status 200), so the conflict is
      // surfaced as an in-stream error frame, not an HTTP 409. The behavioral
      // contract is: the second POST does NOT create a second user message.
      const clientMessageId = '22222222-2222-2222-2222-222222222222'

      const first = await service.client.post(
        `/v1/briefing-chats/${fixtures.annotation.id}/messages`,
        { content: 'original content', clientMessageId },
      )
      expect(first.status).toBe(HttpStatus.OK)

      await service.client.post(
        `/v1/briefing-chats/${fixtures.annotation.id}/messages`,
        { content: 'tampered content', clientMessageId },
      )

      const userMessages = await service.prisma.chatMessage.findMany({
        where: {
          conversationId: fixtures.conversation.id,
          role: ChatMessageRole.user,
        },
      })
      expect(userMessages).toHaveLength(1)
      expect(userMessages[0].content).toBe('original content')
    })
  })

  describe('GET /v1/briefing-chats/:annotationId', () => {
    it('returns conversationId and seeded message history', async () => {
      await chatStore.appendMessage({
        conversationId: fixtures.conversation.id,
        role: ChatMessageRole.user,
        content: 'seeded user message',
      })
      await chatStore.appendMessage({
        conversationId: fixtures.conversation.id,
        role: ChatMessageRole.assistant,
        content: 'seeded assistant reply',
      })

      const res = await service.client.get(
        `/v1/briefing-chats/${fixtures.annotation.id}`,
      )

      expect(res.status).toBe(HttpStatus.OK)
      expect(res.data.conversationId).toBe(fixtures.conversation.id)
      const messages = res.data.messages as Array<{
        id: string
        role: string
        content: string
        createdAt: string
      }>
      expect(messages).toHaveLength(2)
      expect(messages[0].role).toBe(ChatMessageRole.user)
      expect(messages[0].content).toBe('seeded user message')
      expect(messages[1].role).toBe(ChatMessageRole.assistant)
      expect(messages[1].content).toBe('seeded assistant reply')
    })

    it('returns 401 when Authorization is invalid', async () => {
      const res = await service.client.get(
        `/v1/briefing-chats/${fixtures.annotation.id}`,
        { headers: { Authorization: 'Bearer invalid' } },
      )

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED)
    })

    it('returns 404 when annotation belongs to another user (IDOR)', async () => {
      const other = await createOtherUser('get-idor')
      const otherFixtures = await createBriefingFixtures(other.id)

      const res = await service.client.get(
        `/v1/briefing-chats/${otherFixtures.annotation.id}`,
      )

      expect(res.status).toBe(HttpStatus.NOT_FOUND)
    })
  })

  describe('DELETE /v1/briefing-chats/:annotationId', () => {
    it('returns 204 with empty body on success', async () => {
      const res = await service.client.delete(
        `/v1/briefing-chats/${fixtures.annotation.id}`,
      )

      expect(res.status).toBe(HttpStatus.NO_CONTENT)
      expect(res.data === '' || res.data === undefined).toBe(true)
    })

    it('soft-deletes the conversation', async () => {
      await service.client.delete(
        `/v1/briefing-chats/${fixtures.annotation.id}`,
      )

      const updated = await service.prisma.chatConversation.findUnique({
        where: { id: fixtures.conversation.id },
      })
      expect(updated?.deletedAt).not.toBeNull()
    })

    it('returns 404 from GET after soft-delete', async () => {
      await chatStore.appendMessage({
        conversationId: fixtures.conversation.id,
        role: ChatMessageRole.user,
        content: 'pre-delete message',
      })
      await service.client.delete(
        `/v1/briefing-chats/${fixtures.annotation.id}`,
      )

      const res = await service.client.get(
        `/v1/briefing-chats/${fixtures.annotation.id}`,
      )

      expect(res.status).toBe(HttpStatus.NOT_FOUND)
    })

    it('returns 401 when Authorization is invalid', async () => {
      const res = await service.client.delete(
        `/v1/briefing-chats/${fixtures.annotation.id}`,
        { headers: { Authorization: 'Bearer invalid' } },
      )

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED)
    })

    it('returns 404 when annotation belongs to another user (IDOR)', async () => {
      const other = await createOtherUser('del-idor')
      const otherFixtures = await createBriefingFixtures(other.id)

      const res = await service.client.delete(
        `/v1/briefing-chats/${otherFixtures.annotation.id}`,
      )

      expect(res.status).toBe(HttpStatus.NOT_FOUND)
    })
  })
})
