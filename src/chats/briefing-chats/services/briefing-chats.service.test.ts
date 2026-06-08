import { BadRequestException, NotFoundException } from '@nestjs/common'
import {
  Annotation,
  AnnotationKind,
  AnnotationResourceType,
  ChatConversation,
  ChatMessage,
  ChatMessageRole,
  MeetingBriefing,
} from '../../../generated/prisma'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { ChatStoreService } from '@/chats/services/chatStore.prisma'
import type {
  ChatStreamChunk,
  StreamArgs,
} from '@/chats/services/chatStream.service'
import { ChatStreamService } from '@/chats/services/chatStream.service'
import type {
  Artifact,
  GetArtifactsInput,
  GetArtifactsOutput,
} from '@/llm/tools/getArtifacts.tool'
import type { LlmStreamTool } from '@/llm/services/llm.service'
import { BriefingSchema } from '@/chats/briefing-chats/types/briefing.schema'
import type { BriefingContextService } from './briefingContext.service'
import { BriefingChatsService } from './briefing-chats.service'
import type { DistrictResolverService } from './districtResolver.service'
import { extractHighlight } from './extractHighlight'
import { buildSystemPrompt, todayInTimezone } from './systemPromptBuilder'

type ParsedBriefing = z.infer<typeof BriefingSchema>

const buildArtifactJson = (): string => {
  const briefing: ParsedBriefing = {
    version: '1.0',
    generatedAt: '2026-05-01T00:00:00Z',
    generationModel: 'test-model',
    meeting: {
      citySlug: 'springfield',
      cityName: 'Springfield',
      state: 'OR',
      body: 'City Council',
      date: '2026-06-01',
      time: '6:30 PM',
      title: 'Regular Council Meeting',
      readTime: '8 min',
      sourceUrl: 'https://example.com/agenda.pdf',
      sourceType: 'agenda packet',
    },
    executiveSummary: {
      headline: 'Headline',
      subheadline: 'Sub',
      priorityItemCount: 1,
      totalAgendaItems: 3,
    },
    priorityIssues: [
      {
        number: 1,
        slug: 'str-ordinance',
        agendaItemTitle: 'STR Ordinance',
        category: 'land use',
        card: {
          headline: 'h',
          whatYouNeedToDo: 'w',
          askThisInTheRoom: 'a',
          tryThis: null,
          actionButtons: [],
        },
        detail: {
          whatIsHappening: 'x',
          whatDecision: 'd',
          whyItMatters: 'y',
          recommendation: 'r',
          actionItem: 'ai',
          askThis: 'a',
          tryThis: null,
          whoIsPresenting: null,
          supportingContext: null,
          supportingDocuments: [
            { name: 'STR Staff Memo', url: 'https://example.com/str.pdf' },
          ],
        },
      },
    ],
    fullAgenda: [],
    fullAgendaSummary: 'summary',
    constituentData: {
      available: false,
      voterCount: null,
      topIssues: [],
      ideology: null,
    },
    footer: { preparedBy: 'GP', contactNote: 'contact' },
  }
  return JSON.stringify(briefing)
}

const ARTIFACT_JSON = buildArtifactJson()

const CONVERSATION_ID = 'conv-123'
const ANNOTATION_ID = 'anno-123'
const USER_ID = 7

const buildAnnotation = (overrides: Partial<Annotation> = {}): Annotation =>
  ({
    id: ANNOTATION_ID,
    authorUserId: USER_ID,
    kind: AnnotationKind.chat,
    resourceId: 'briefing-1',
    resourceType: AnnotationResourceType.briefing,
    jsonPath: null,
    start: null,
    end: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    noteId: null,
    chatConversationId: CONVERSATION_ID,
    annotationBugReportId: null,
    ...overrides,
  }) as unknown as Annotation

const buildBriefing = (): MeetingBriefing =>
  ({
    id: 'briefing-1',
    electedOfficeId: 'eo-1',
    experimentRunId: 'run-1',
    artifactBucket: 'b',
    artifactKey: 'k',
    meetingDate: new Date('2026-06-01T00:00:00Z'),
    meetingTime: '18:00',
    meetingTimezone: 'America/New_York',
  }) as unknown as MeetingBriefing

const buildConversation = (): ChatConversation =>
  ({
    id: CONVERSATION_ID,
    ownerUserId: USER_ID,
    title: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    deletedAt: null,
  }) as unknown as ChatConversation

class FakeBriefingContext {
  loadContext = vi.fn(() =>
    Promise.resolve({
      annotation: buildAnnotation(),
      briefing: buildBriefing(),
      artifactContent: ARTIFACT_JSON,
      user: { firstName: 'Jane', lastName: 'Doe' },
      office: { title: 'Council Member', jurisdiction: null },
    }),
  )

  asService(): BriefingContextService {
    return this as unknown as BriefingContextService
  }
}

class FakeChatStore {
  findConversationByIdAndOwner = vi.fn<
    (id: string, ownerUserId: number) => Promise<ChatConversation | null>
  >(() => Promise.resolve(buildConversation()))
  listMessagesByConversation = vi.fn<
    (conversationId: string) => Promise<ChatMessage[]>
  >(() => Promise.resolve([]))
  softDeleteConversation = vi.fn<
    (id: string, ownerUserId: number) => Promise<void>
  >(() => Promise.resolve())

  asService(): ChatStoreService {
    return this as unknown as ChatStoreService
  }
}

class FakeChatStream {
  public lastArgs: StreamArgs | undefined
  private chunks: ChatStreamChunk[] = [
    { type: 'text', delta: 'hi' },
    { type: 'done', assistantMessageId: 'm-1' },
  ]

  setChunks(chunks: ChatStreamChunk[]): void {
    this.chunks = chunks
  }

  stream(args: StreamArgs): AsyncIterable<ChatStreamChunk> {
    this.lastArgs = args
    const chunks = this.chunks
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const c of chunks) yield c
      },
    }
  }

  asService(): ChatStreamService {
    return this as unknown as ChatStreamService
  }
}

class FakeBriefingNotes {
  loadNotesForChatMock = vi.fn<
    (args: {
      userId: number
      briefingId: string
      artifactContent: string
    }) => Promise<
      Array<{
        id: string
        body: string
        jsonPath: string | null
        highlightedText: string | null
        createdAt: string
      }>
    >
  >(() => Promise.resolve([]))
  countNotesForUserMock = vi.fn<
    (args: { userId: number; briefingId: string }) => Promise<number>
  >(() => Promise.resolve(0))

  loadNotesForChat(args: {
    userId: number
    briefingId: string
    artifactContent: string
  }) {
    return this.loadNotesForChatMock(args)
  }

  countNotesForUser(args: { userId: number; briefingId: string }) {
    return this.countNotesForUserMock(args)
  }

  asService(): import('./briefingNotes.service').BriefingNotesService {
    return this as unknown as import('./briefingNotes.service').BriefingNotesService
  }
}

const consume = async <T>(iter: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = []
  for await (const item of iter) out.push(item)
  return out
}

type StreamArgsWithClientId = StreamArgs & { clientMessageId?: string }

describe('BriefingChatsService', () => {
  let briefingContext: FakeBriefingContext
  let chatStore: FakeChatStore
  let chatStream: FakeChatStream
  let svc: BriefingChatsService

  beforeEach(() => {
    briefingContext = new FakeBriefingContext()
    chatStore = new FakeChatStore()
    chatStream = new FakeChatStream()
    svc = new BriefingChatsService(
      briefingContext.asService(),
      chatStore.asService(),
      chatStream.asService(),
      new FakeBriefingNotes().asService(),
    )
  })

  describe('sendMessage', () => {
    it('loads context, calls chatStream.stream with derived args, and yields its chunks', async () => {
      const ac = new AbortController()
      const iter = svc.sendMessage({
        annotationId: ANNOTATION_ID,
        userId: USER_ID,
        userMessage: 'what about agenda item 3?',
        signal: ac.signal,
      })
      const chunks = await consume(iter)

      expect(briefingContext.loadContext).toHaveBeenCalledWith(
        ANNOTATION_ID,
        USER_ID,
      )
      expect(chatStream.lastArgs).toBeDefined()
      expect(chatStream.lastArgs?.conversationId).toBe(CONVERSATION_ID)
      expect(chatStream.lastArgs?.ownerUserId).toBe(USER_ID)
      expect(chatStream.lastArgs?.userMessage).toBe('what about agenda item 3?')
      expect(chatStream.lastArgs?.signal).toBe(ac.signal)
      expect(chunks).toEqual([
        { type: 'text', delta: 'hi' },
        { type: 'done', assistantMessageId: 'm-1' },
      ])
    })

    it('passes the exact systemPrompt produced by buildSystemPrompt', async () => {
      const annotation = buildAnnotation()
      const briefing = buildBriefing()
      const artifactContent = ARTIFACT_JSON
      const user = { firstName: 'Jane', lastName: 'Doe' }
      const office = { title: 'Council Member', jurisdiction: null }
      briefingContext.loadContext.mockResolvedValueOnce({
        annotation,
        briefing,
        artifactContent,
        user,
        office,
      })

      const iter = svc.sendMessage({
        annotationId: ANNOTATION_ID,
        userId: USER_ID,
        userMessage: 'hi',
      })
      await consume(iter)

      const parsedRes = BriefingSchema.safeParse(JSON.parse(artifactContent))
      const expected = buildSystemPrompt({
        annotation,
        briefing,
        artifactContent,
        today: todayInTimezone(briefing.meetingTimezone),
        availableToolNames: Object.keys(chatStream.lastArgs?.tools ?? {}),
        notesCount: 0,
        user,
        office,
        highlight: extractHighlight(artifactContent, annotation),
        parsed: parsedRes.success ? parsedRes.data : null,
      })
      expect(chatStream.lastArgs?.systemPrompt).toBe(expected)
    })

    it('passes exactly get_artifacts when no search/databricks/resolver are configured', async () => {
      const iter = svc.sendMessage({
        annotationId: ANNOTATION_ID,
        userId: USER_ID,
        userMessage: 'hi',
      })
      await consume(iter)

      const tools = chatStream.lastArgs?.tools ?? {}
      expect(Object.keys(tools).sort()).toEqual(['get_artifacts'])
    })

    it('get_artifacts tool returns artifacts derived from the briefing JSON', async () => {
      const iter = svc.sendMessage({
        annotationId: ANNOTATION_ID,
        userId: USER_ID,
        userMessage: 'hi',
      })
      await consume(iter)

      const tools = chatStream.lastArgs?.tools ?? {}
      const tool = tools.get_artifacts as unknown as LlmStreamTool<
        GetArtifactsInput,
        GetArtifactsOutput
      >
      const out = await tool.execute({})

      const briefingId = buildBriefing().id
      const expected: Artifact[] = [
        {
          id: `${briefingId}:source`,
          title: 'Regular Council Meeting',
          kind: 'document',
          snippet: 'Source agenda packet for the 2026-06-01 meeting.',
          url: 'https://example.com/agenda.pdf',
        },
        {
          id: `${briefingId}:priority-1:0`,
          title: 'STR Staff Memo',
          kind: 'link',
          snippet: 'Supporting document for "STR Ordinance" (land use).',
          url: 'https://example.com/str.pdf',
        },
      ]
      expect(out).toEqual(expected)
    })

    it('adds web_search when a search provider is configured', async () => {
      const searchProvider = {
        search: vi.fn(() => Promise.resolve([])),
      }
      svc = new BriefingChatsService(
        briefingContext.asService(),
        chatStore.asService(),
        chatStream.asService(),
        new FakeBriefingNotes().asService(),
        searchProvider,
      )

      const iter = svc.sendMessage({
        annotationId: ANNOTATION_ID,
        userId: USER_ID,
        userMessage: 'hi',
      })
      await consume(iter)

      const tools = chatStream.lastArgs?.tools ?? {}
      expect(Object.keys(tools).sort()).toEqual(
        ['get_artifacts', 'web_search'].sort(),
      )
    })

    it('wires district_insights and list_district_topics when databricks + resolver are configured and user has a district', async () => {
      const databricks = {
        query: vi.fn(() => Promise.resolve({ columns: [], rows: [] })),
      }
      const districtResolver = {
        resolveByUserId: vi.fn(() =>
          Promise.resolve({
            state: 'CA',
            l2DistrictType: 'City',
            l2DistrictName: 'Oakland',
          }),
        ),
        toMandatoryFilters: vi.fn(() => [
          { column: 'state_postal_code', value: 'CA' },
          { column: 'City', value: 'Oakland' },
        ]),
      }
      svc = new BriefingChatsService(
        briefingContext.asService(),
        chatStore.asService(),
        chatStream.asService(),
        new FakeBriefingNotes().asService(),
        undefined,
        databricks,
        districtResolver as unknown as DistrictResolverService,
      )

      const iter = svc.sendMessage({
        annotationId: ANNOTATION_ID,
        userId: USER_ID,
        userMessage: 'hi',
      })
      await consume(iter)

      expect(districtResolver.resolveByUserId).toHaveBeenCalledWith(USER_ID)
      expect(districtResolver.toMandatoryFilters).toHaveBeenCalledWith({
        state: 'CA',
        l2DistrictType: 'City',
        l2DistrictName: 'Oakland',
      })
      const tools = chatStream.lastArgs?.tools ?? {}
      expect(Object.keys(tools).sort()).toEqual(
        ['district_insights', 'get_artifacts', 'list_district_topics'].sort(),
      )
    })

    it('omits district tools when databricks + resolver are configured but the resolver returns null', async () => {
      const databricks = {
        query: vi.fn(() => Promise.resolve({ columns: [], rows: [] })),
      }
      const districtResolver = {
        resolveByUserId: vi.fn(() => Promise.resolve(null)),
        toMandatoryFilters: vi.fn(),
      }
      svc = new BriefingChatsService(
        briefingContext.asService(),
        chatStore.asService(),
        chatStream.asService(),
        new FakeBriefingNotes().asService(),
        undefined,
        databricks,
        districtResolver as unknown as DistrictResolverService,
      )

      const iter = svc.sendMessage({
        annotationId: ANNOTATION_ID,
        userId: USER_ID,
        userMessage: 'hi',
      })
      await consume(iter)

      expect(districtResolver.resolveByUserId).toHaveBeenCalledWith(USER_ID)
      expect(districtResolver.toMandatoryFilters).not.toHaveBeenCalled()
      const tools = chatStream.lastArgs?.tools ?? {}
      expect(Object.keys(tools).sort()).toEqual(['get_artifacts'])
    })

    it('forwards clientMessageId to chatStream.stream when provided', async () => {
      const clientMessageId = '11111111-1111-4111-8111-111111111111'
      const iter = svc.sendMessage({
        annotationId: ANNOTATION_ID,
        userId: USER_ID,
        userMessage: 'hi',
        clientMessageId,
      })
      await consume(iter)

      const args = chatStream.lastArgs as StreamArgsWithClientId | undefined
      expect(args?.clientMessageId).toBe(clientMessageId)
    })

    it('does not set clientMessageId when omitted', async () => {
      const iter = svc.sendMessage({
        annotationId: ANNOTATION_ID,
        userId: USER_ID,
        userMessage: 'hi',
      })
      await consume(iter)

      const args = chatStream.lastArgs as StreamArgsWithClientId | undefined
      expect(args?.clientMessageId).toBeUndefined()
    })

    it('propagates NotFoundException from briefingContext.loadContext', async () => {
      briefingContext.loadContext.mockRejectedValueOnce(
        new NotFoundException('Annotation not found'),
      )
      await expect(
        consume(
          svc.sendMessage({
            annotationId: 'missing',
            userId: USER_ID,
            userMessage: 'hi',
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('propagates BadRequestException from briefingContext.loadContext', async () => {
      briefingContext.loadContext.mockRejectedValueOnce(
        new BadRequestException('bad'),
      )
      await expect(
        consume(
          svc.sendMessage({
            annotationId: ANNOTATION_ID,
            userId: USER_ID,
            userMessage: 'hi',
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('throws NotFoundException when annotation.chatConversationId is null', async () => {
      briefingContext.loadContext.mockResolvedValueOnce({
        annotation: buildAnnotation({ chatConversationId: null }),
        briefing: buildBriefing(),
        artifactContent: ARTIFACT_JSON,
        user: { firstName: 'Jane', lastName: 'Doe' },
        office: { title: 'Council Member', jurisdiction: null },
      })
      await expect(
        consume(
          svc.sendMessage({
            annotationId: ANNOTATION_ID,
            userId: USER_ID,
            userMessage: 'hi',
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    describe('notes tool gating', () => {
      it('omits get_my_notes when user has no notes', async () => {
        const notes = new FakeBriefingNotes()
        notes.countNotesForUserMock.mockResolvedValueOnce(0)
        svc = new BriefingChatsService(
          briefingContext.asService(),
          chatStore.asService(),
          chatStream.asService(),
          notes.asService(),
        )

        const iter = svc.sendMessage({
          annotationId: ANNOTATION_ID,
          userId: USER_ID,
          userMessage: 'hi',
        })
        await consume(iter)

        const tools = chatStream.lastArgs?.tools ?? {}
        expect(tools.get_my_notes).toBeUndefined()
        expect(notes.loadNotesForChatMock).not.toHaveBeenCalled()
      })

      it('registers get_my_notes when count > 0 but does not eagerly load', async () => {
        const notes = new FakeBriefingNotes()
        notes.countNotesForUserMock.mockResolvedValueOnce(3)
        svc = new BriefingChatsService(
          briefingContext.asService(),
          chatStore.asService(),
          chatStream.asService(),
          notes.asService(),
        )

        const iter = svc.sendMessage({
          annotationId: ANNOTATION_ID,
          userId: USER_ID,
          userMessage: 'hi',
        })
        await consume(iter)

        const tools = chatStream.lastArgs?.tools ?? {}
        expect(tools.get_my_notes).toBeDefined()
        expect(notes.loadNotesForChatMock).not.toHaveBeenCalled()
      })

      it('loads notes lazily when get_my_notes is actually executed', async () => {
        const notes = new FakeBriefingNotes()
        notes.countNotesForUserMock.mockResolvedValueOnce(2)
        notes.loadNotesForChatMock.mockResolvedValueOnce([
          {
            id: 'n-1',
            body: 'a body',
            jsonPath: null,
            highlightedText: null,
            createdAt: '2026-05-10T15:00:00Z',
          },
          {
            id: 'n-2',
            body: 'b body',
            jsonPath: null,
            highlightedText: null,
            createdAt: '2026-05-11T15:00:00Z',
          },
        ])
        svc = new BriefingChatsService(
          briefingContext.asService(),
          chatStore.asService(),
          chatStream.asService(),
          notes.asService(),
        )

        const iter = svc.sendMessage({
          annotationId: ANNOTATION_ID,
          userId: USER_ID,
          userMessage: 'hi',
        })
        await consume(iter)

        expect(notes.loadNotesForChatMock).not.toHaveBeenCalled()

        const tools = chatStream.lastArgs?.tools ?? {}
        const tool = tools.get_my_notes as unknown as LlmStreamTool<
          Record<string, never>,
          Array<{ id: string }>
        >
        const out = await tool.execute({})

        expect(out.map((n) => n.id)).toEqual(['n-1', 'n-2'])
        expect(notes.loadNotesForChatMock).toHaveBeenCalledTimes(1)
      })

      it('retries the load on the next invocation if the first load rejected', async () => {
        const notes = new FakeBriefingNotes()
        notes.countNotesForUserMock.mockResolvedValueOnce(1)
        let callCount = 0
        notes.loadNotesForChatMock.mockImplementation(() => {
          callCount += 1
          if (callCount === 1) {
            return Promise.reject(new Error('transient db hiccup'))
          }
          return Promise.resolve([
            {
              id: 'n-1',
              body: 'body',
              jsonPath: null,
              highlightedText: null,
              createdAt: '2026-05-10T15:00:00Z',
            },
          ])
        })
        svc = new BriefingChatsService(
          briefingContext.asService(),
          chatStore.asService(),
          chatStream.asService(),
          notes.asService(),
        )

        const iter = svc.sendMessage({
          annotationId: ANNOTATION_ID,
          userId: USER_ID,
          userMessage: 'hi',
        })
        await consume(iter)

        const tools = chatStream.lastArgs?.tools ?? {}
        const tool = tools.get_my_notes as unknown as LlmStreamTool<
          Record<string, never>,
          Array<{ id: string }>
        >

        await expect(tool.execute({})).rejects.toThrow('transient db hiccup')

        const out = await tool.execute({})
        expect(out.map((n) => n.id)).toEqual(['n-1'])
        expect(notes.loadNotesForChatMock).toHaveBeenCalledTimes(2)
      })

      it('only loads notes once across repeated tool invocations in the same turn', async () => {
        const notes = new FakeBriefingNotes()
        notes.countNotesForUserMock.mockResolvedValueOnce(1)
        notes.loadNotesForChatMock.mockResolvedValueOnce([
          {
            id: 'n-1',
            body: 'body',
            jsonPath: null,
            highlightedText: null,
            createdAt: '2026-05-10T15:00:00Z',
          },
        ])
        svc = new BriefingChatsService(
          briefingContext.asService(),
          chatStore.asService(),
          chatStream.asService(),
          notes.asService(),
        )

        const iter = svc.sendMessage({
          annotationId: ANNOTATION_ID,
          userId: USER_ID,
          userMessage: 'hi',
        })
        await consume(iter)

        const tools = chatStream.lastArgs?.tools ?? {}
        const tool = tools.get_my_notes as unknown as LlmStreamTool<
          Record<string, never>,
          Array<{ id: string }>
        >

        await tool.execute({})
        await tool.execute({})
        await tool.execute({})

        expect(notes.loadNotesForChatMock).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('loadConversation', () => {
    it('returns conversationId and messages from chatStore', async () => {
      const messages: ChatMessage[] = [
        {
          id: 'm-1',
          conversationId: CONVERSATION_ID,
          role: ChatMessageRole.user,
          content: 'hello',
          createdAt: new Date('2026-01-01T00:00:01Z'),
        } as unknown as ChatMessage,
        {
          id: 'm-2',
          conversationId: CONVERSATION_ID,
          role: ChatMessageRole.assistant,
          content: 'hi back',
          createdAt: new Date('2026-01-01T00:00:02Z'),
        } as unknown as ChatMessage,
      ]
      chatStore.listMessagesByConversation.mockResolvedValueOnce(messages)

      const result = await svc.loadConversation(ANNOTATION_ID, USER_ID)

      expect(result.conversationId).toBe(CONVERSATION_ID)
      expect(result.messages).toEqual(messages)
      expect(briefingContext.loadContext).toHaveBeenCalledWith(
        ANNOTATION_ID,
        USER_ID,
      )
      expect(chatStore.findConversationByIdAndOwner).toHaveBeenCalledWith(
        CONVERSATION_ID,
        USER_ID,
      )
      expect(chatStore.listMessagesByConversation).toHaveBeenCalledWith(
        CONVERSATION_ID,
      )
    })

    it('throws NotFoundException when conversation is soft-deleted or missing', async () => {
      chatStore.findConversationByIdAndOwner.mockResolvedValueOnce(null)

      await expect(
        svc.loadConversation(ANNOTATION_ID, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException)
      expect(chatStore.listMessagesByConversation).not.toHaveBeenCalled()
    })

    it('propagates NotFoundException from briefingContext.loadContext', async () => {
      briefingContext.loadContext.mockRejectedValueOnce(
        new NotFoundException('Annotation not found'),
      )
      await expect(
        svc.loadConversation('missing', USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws NotFoundException when annotation.chatConversationId is null', async () => {
      briefingContext.loadContext.mockResolvedValueOnce({
        annotation: buildAnnotation({ chatConversationId: null }),
        briefing: buildBriefing(),
        artifactContent: ARTIFACT_JSON,
        user: { firstName: 'Jane', lastName: 'Doe' },
        office: { title: 'Council Member', jurisdiction: null },
      })
      await expect(
        svc.loadConversation(ANNOTATION_ID, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('deleteConversation', () => {
    it('calls chatStore.softDeleteConversation with conversationId + ownerUserId', async () => {
      await svc.deleteConversation(ANNOTATION_ID, USER_ID)

      expect(briefingContext.loadContext).toHaveBeenCalledWith(
        ANNOTATION_ID,
        USER_ID,
      )
      expect(chatStore.softDeleteConversation).toHaveBeenCalledWith(
        CONVERSATION_ID,
        USER_ID,
      )
    })

    it('propagates NotFoundException from briefingContext.loadContext', async () => {
      briefingContext.loadContext.mockRejectedValueOnce(
        new NotFoundException('Annotation not found'),
      )
      await expect(
        svc.deleteConversation('missing', USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws NotFoundException when annotation.chatConversationId is null', async () => {
      briefingContext.loadContext.mockResolvedValueOnce({
        annotation: buildAnnotation({ chatConversationId: null }),
        briefing: buildBriefing(),
        artifactContent: ARTIFACT_JSON,
        user: { firstName: 'Jane', lastName: 'Doe' },
        office: { title: 'Council Member', jurisdiction: null },
      })
      await expect(
        svc.deleteConversation(ANNOTATION_ID, USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException)
    })
  })

  describe('assertBriefingChatAccessible', () => {
    it('resolves when loadContext succeeds', async () => {
      await expect(
        svc.assertBriefingChatAccessible(ANNOTATION_ID, USER_ID),
      ).resolves.toBeUndefined()
      expect(briefingContext.loadContext).toHaveBeenCalledWith(
        ANNOTATION_ID,
        USER_ID,
      )
    })

    it('throws NotFoundException when loadContext throws NotFoundException', async () => {
      briefingContext.loadContext.mockRejectedValueOnce(
        new NotFoundException('Annotation not found'),
      )
      await expect(
        svc.assertBriefingChatAccessible('missing', USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException)
    })

    it('throws BadRequestException when loadContext throws BadRequestException', async () => {
      briefingContext.loadContext.mockRejectedValueOnce(
        new BadRequestException('bad'),
      )
      await expect(
        svc.assertBriefingChatAccessible(ANNOTATION_ID, USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException)
    })
  })
})
