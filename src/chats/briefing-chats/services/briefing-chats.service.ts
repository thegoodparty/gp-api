import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { ChatMessage } from '../../../generated/prisma'
import { ChatStoreService } from '@/chats/services/chatStore.prisma'
import {
  ChatStreamChunk,
  ChatStreamService,
} from '@/chats/services/chatStream.service'
import { z } from 'zod'
import type { LlmStreamTool } from '@/llm/services/llm.service'
import { buildDistrictInsightsTool } from '@/llm/tools/districtInsights.tool'
import { buildDistrictTopicsTool } from '@/llm/tools/districtTopics.tool'
import {
  buildGetMyNotesTool,
  Note,
  NotesProvider,
} from '@/llm/tools/getMyNotes.tool'
import {
  Artifact,
  ArtifactsProvider,
  buildGetArtifactsTool,
} from '@/llm/tools/getArtifacts.tool'
import type { DatabricksProvider } from '@/llm/tools/queryDatabricks.tool'
import { buildWebSearchTool, SearchProvider } from '@/llm/tools/webSearch.tool'
import { BriefingSchema } from '@/chats/briefing-chats/types/briefing.schema'
import { BriefingArtifactsProvider } from './briefingArtifactsProvider'
import { BriefingContextService } from './briefingContext.service'
import { BriefingNotesService } from './briefingNotes.service'
import { DistrictResolverService } from './districtResolver.service'
import { extractHighlight } from './extractHighlight'
import { buildSystemPrompt, todayInTimezone } from './systemPromptBuilder'

type ParsedBriefing = z.infer<typeof BriefingSchema>

const safeParseArtifact = (raw: string): ParsedBriefing | null => {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }
  const parsed = BriefingSchema.safeParse(json)
  return parsed.success ? parsed.data : null
}

class LazyNotesProvider implements NotesProvider {
  private cached: Promise<Note[]> | null = null

  constructor(
    private readonly notesService: BriefingNotesService,
    private readonly userId: number,
    private readonly briefingId: string,
    private readonly artifactContent: string,
  ) {}

  list(): Promise<Note[]> {
    if (this.cached === null) {
      const pending = this.notesService.loadNotesForChat({
        userId: this.userId,
        briefingId: this.briefingId,
        artifactContent: this.artifactContent,
      })
      this.cached = pending
      pending.catch(() => {
        if (this.cached === pending) this.cached = null
      })
    }
    return this.cached
  }
}

export const BRIEFING_CHATS_SEARCH_PROVIDER = 'BRIEFING_CHATS_SEARCH_PROVIDER'
export const BRIEFING_CHATS_DATABRICKS_PROVIDER =
  'BRIEFING_CHATS_DATABRICKS_PROVIDER'

const HAYSTAQ_TABLE = 'int__l2_nationwide_uniform_w_haystaq'
const HAYSTAQ_ALLOWED_TABLES = new Set([HAYSTAQ_TABLE])

export const BRIEFING_CHAT_MODELS = [
  'claude-sonnet-4-6',
  'claude-opus-4-7',
] as const

export interface SendMessageArgs {
  annotationId: string
  userId: number
  userMessage: string
  signal?: AbortSignal
  clientMessageId?: string
}

export interface LoadConversationResult {
  conversationId: string
  messages: ChatMessage[]
}

const requireConversationId = (chatConversationId: string | null): string => {
  if (chatConversationId === null) {
    throw new NotFoundException(
      'Conversation not initialized for this annotation',
    )
  }
  return chatConversationId
}

@Injectable()
export class BriefingChatsService {
  constructor(
    private readonly briefingContext: BriefingContextService,
    private readonly chatStore: ChatStoreService,
    private readonly chatStream: ChatStreamService,
    private readonly notesService: BriefingNotesService,
    @Optional()
    @Inject(BRIEFING_CHATS_SEARCH_PROVIDER)
    private readonly searchProvider?: SearchProvider,
    @Optional()
    @Inject(BRIEFING_CHATS_DATABRICKS_PROVIDER)
    private readonly databricks?: DatabricksProvider,
    @Optional()
    private readonly districtResolver?: DistrictResolverService,
  ) {}

  sendMessage(args: SendMessageArgs): AsyncIterable<ChatStreamChunk> {
    const run = async function* (
      self: BriefingChatsService,
    ): AsyncGenerator<ChatStreamChunk, void, void> {
      const { annotation, briefing, artifactContent, user, office } =
        await self.briefingContext.loadContext(args.annotationId, args.userId)

      const parsed = safeParseArtifact(artifactContent)
      const { tools, availableToolNames, notesCount } =
        await self.buildToolsForUser({
          userId: args.userId,
          briefingId: briefing.id,
          artifactContent,
          parsed,
        })

      const today = todayInTimezone(briefing.meetingTimezone)
      const highlight = extractHighlight(artifactContent, annotation)
      const systemPrompt = buildSystemPrompt({
        annotation,
        briefing,
        artifactContent,
        today,
        availableToolNames,
        notesCount,
        user,
        office,
        highlight,
        parsed,
      })

      const conversationId = requireConversationId(
        annotation.chatConversationId,
      )

      const inner = self.chatStream.stream({
        conversationId,
        ownerUserId: args.userId,
        systemPrompt,
        tools,
        userMessage: args.userMessage,
        models: [...BRIEFING_CHAT_MODELS],
        ...(args.signal && { signal: args.signal }),
        ...(args.clientMessageId && { clientMessageId: args.clientMessageId }),
      })

      for await (const chunk of inner) yield chunk
    }
    return {
      [Symbol.asyncIterator]: () => run(this),
    }
  }

  async assertBriefingChatAccessible(
    annotationId: string,
    userId: number,
  ): Promise<void> {
    await this.briefingContext.loadContext(annotationId, userId)
  }

  async loadConversation(
    annotationId: string,
    userId: number,
  ): Promise<LoadConversationResult> {
    const { annotation } = await this.briefingContext.loadContext(
      annotationId,
      userId,
    )
    const conversationId = requireConversationId(annotation.chatConversationId)
    const conversation = await this.chatStore.findConversationByIdAndOwner(
      conversationId,
      userId,
    )
    if (!conversation) {
      throw new NotFoundException('Conversation not found')
    }
    const messages =
      await this.chatStore.listMessagesByConversation(conversationId)
    return { conversationId, messages }
  }

  async deleteConversation(
    annotationId: string,
    userId: number,
  ): Promise<void> {
    const { annotation } = await this.briefingContext.loadContext(
      annotationId,
      userId,
    )
    const conversationId = requireConversationId(annotation.chatConversationId)
    await this.chatStore.softDeleteConversation(conversationId, userId)
  }

  private async buildToolsForUser(args: {
    userId: number
    briefingId: string
    artifactContent: string
    parsed: ParsedBriefing | null
  }): Promise<{
    tools: Record<string, LlmStreamTool<z.ZodTypeAny>>
    availableToolNames: string[]
    notesCount: number
  }> {
    const { userId, briefingId, artifactContent, parsed } = args
    const tools: Record<string, LlmStreamTool<z.ZodTypeAny>> = {}
    const artifactsProvider = new BriefingArtifactsProvider(parsed, briefingId)
    tools.get_artifacts = buildGetArtifactsTool({ provider: artifactsProvider })

    if (this.searchProvider) {
      tools.web_search = buildWebSearchTool({ provider: this.searchProvider })
    }

    if (this.databricks && this.districtResolver) {
      const resolved = await this.districtResolver.resolveByUserId(userId)
      if (resolved) {
        const mandatoryFilters =
          this.districtResolver.toMandatoryFilters(resolved)
        tools.district_insights = buildDistrictInsightsTool({
          provider: this.databricks,
          allowedTables: HAYSTAQ_ALLOWED_TABLES,
          mandatoryFilters,
        })
        tools.list_district_topics = buildDistrictTopicsTool()
      }
    }

    const notesCount = await this.notesService.countNotesForUser({
      userId,
      briefingId,
    })
    if (notesCount > 0) {
      const lazyProvider = new LazyNotesProvider(
        this.notesService,
        userId,
        briefingId,
        artifactContent,
      )
      tools.get_my_notes = buildGetMyNotesTool({ provider: lazyProvider })
    }

    return {
      tools,
      availableToolNames: Object.keys(tools),
      notesCount,
    }
  }
}

export type { Artifact, ArtifactsProvider, SearchProvider }
