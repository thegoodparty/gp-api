import { Injectable } from '@nestjs/common'
import { CreateAiChatSchema } from './schemas/CreateAiChat.schema'
import {
  PromptReplaceCampaign,
  PromptReplaceService,
} from 'src/ai/services/promptReplace.service'
import { LlmService, LlmStreamResult } from '@/llm/services/llm.service'
import { formatHtmlLlmResponse } from '@/ai/util/llmResponseFormat.util'
import {
  isChatCompletionMessage,
  toChatCompletionMessage,
} from '@/ai/util/chatMessage.util'
import { ContentService } from 'src/content/services/content.service'
import { RaceTargetMetrics } from 'src/elections/types/elections.types'
import { UpdateAiChatSchema } from './schemas/UpdateAiChat.schema'
import { StreamAiChatSchema } from './schemas/StreamAiChat.schema'
import {
  AiChatMessage,
  CampaignChatChunk,
  CampaignChatErrorCode,
} from './aiChat.types'
import { AiChatFeedbackSchema } from './schemas/AiChatFeedback.schema'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { User } from '@prisma/client'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { buildSlackBlocks } from './util/buildSlackBlocks.util'
import { SlackChannel } from '../../../vendors/slack/slackService.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { requireEnv } from 'src/shared/util/env.util'

const LLAMA_AI_ASSISTANT = requireEnv('LLAMA_AI_ASSISTANT')
const AI_CHAT_MAX_TOKENS = 2000
const AI_CHAT_TEMPERATURE = 0.7
const AI_CHAT_TOP_P = 0.9

// The CMS-managed prompt historically asks the model to emit HTML (for the
// shared content-generation/Quill path). The chat now renders Markdown via
// react-markdown, so we append a final, authoritative formatting directive
// that overrides any HTML guidance from the CMS prompt. Placed last in the
// system message so it takes precedence.
const MARKDOWN_FORMAT_DIRECTIVE = `Formatting requirements (these override any earlier or conflicting formatting instructions):
- Respond using GitHub-flavored Markdown ONLY. Do not output raw HTML tags (no <p>, <ul>, <li>, <a>, <br>, <strong>, etc.).
- Use **bold**, *italics*, \`inline code\`, fenced code blocks, bullet and numbered lists, ## headings, tables, and Markdown links in the form [label](https://example.com).`

const getErrorStatus = (err: unknown): number | undefined => {
  if (err && typeof err === 'object') {
    const candidate = err as { status?: number; statusCode?: number }
    return candidate.status ?? candidate.statusCode
  }
  return undefined
}

const isUpstreamFailure = (status: number | undefined, text: string): boolean =>
  (status !== undefined && status >= 500 && status < 600) ||
  /\b5\d\d\b/.test(text) ||
  /network|ECONN|ETIMEDOUT|fetch failed/i.test(text)

@Injectable()
export class AiChatService extends createPrismaBase(MODELS.AiChat) {
  constructor(
    private readonly llm: LlmService,
    private readonly promptReplaceService: PromptReplaceService,
    private readonly contentService: ContentService,
    private readonly slack: SlackService,
  ) {
    super()
  }

  async create(
    campaign: PromptReplaceCampaign,
    { message, initial }: CreateAiChatSchema,
    liveMetrics?: RaceTargetMetrics | null,
  ) {
    // Create a new chat
    const { candidateJson, systemPrompt } =
      await this.contentService.getChatSystemPrompt(initial)

    const candidateContext = await this.promptReplaceService.promptReplace(
      candidateJson,
      campaign,
      liveMetrics,
    )

    const chatMessage: AiChatMessage = {
      role: 'user',
      content: message,
      id: crypto.randomUUID(),
      createdAt: new Date().valueOf(),
    }

    const threadId = crypto.randomUUID()
    this.logger.info({ threadId }, 'creating thread')

    const chatResponse = await this.runAssistantCompletion({
      systemPrompt,
      candidateContext,
      threadId,
      message: chatMessage,
    })

    this.logger.info({ chatResponse }, 'completion')

    if (!campaign.user?.id) {
      throw new Error('Campaign has no associated user')
    }
    await this.model.create({
      data: {
        assistant: LLAMA_AI_ASSISTANT,
        threadId,
        userId: campaign.user.id,
        campaignId: campaign.id,
        data: {
          messages: [chatMessage, chatResponse],
        },
      },
    })
    return {
      chat: [chatMessage, chatResponse],
      threadId,
    }
  }

  async update(
    threadId: string,
    campaign: PromptReplaceCampaign,
    { regenerate, message }: UpdateAiChatSchema,
    liveMetrics?: RaceTargetMetrics | null,
  ) {
    if (regenerate && !threadId) {
      throw new Error('Cannot regenerate without threadId')
    }

    const aiChat = await this.findFirstOrThrow({
      where: {
        threadId,
        userId: campaign.user?.id,
      },
    })
    const data = aiChat.data as { messages: AiChatMessage[] }
    const messages = data.messages

    const { candidateJson, systemPrompt } =
      await this.contentService.getChatSystemPrompt()

    const candidateContext = await this.promptReplaceService.promptReplace(
      candidateJson,
      campaign,
      liveMetrics,
    )

    let messageId: string | undefined
    if (regenerate) {
      // regenerate last chat response
      const aiMessage = messages[messages.length - 1]
      messageId = aiMessage.id
      messages.pop()
      message = messages[messages.length - 1]?.content
      messages.pop()
    }

    const chatMessage: AiChatMessage = {
      role: 'user',
      // Type narrowing from nullable — runtime context guarantees string but type is broader
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      content: message as string,
      id: crypto.randomUUID(),
      createdAt: new Date().valueOf(),
    }

    const chatResponse = await this.runAssistantCompletion({
      systemPrompt,
      candidateContext,
      threadId,
      message: chatMessage,
      messageId,
      existingMessages: messages,
    })

    this.logger.info({ chatResponse }, 'completion')

    await this.model.update({
      where: { id: aiChat.id },
      data: {
        data: {
          ...aiChat.data,
          messages: [...messages, chatMessage, chatResponse],
        },
      },
    })

    return { message: chatResponse }
  }

  private async runAssistantCompletion({
    systemPrompt,
    candidateContext,
    threadId,
    message,
    messageId,
    existingMessages,
  }: {
    systemPrompt: string
    candidateContext: string
    threadId: string
    message: AiChatMessage
    messageId?: string
    existingMessages?: AiChatMessage[]
  }): Promise<AiChatMessage> {
    if (!systemPrompt) {
      throw new Error('Missing required param: systemPrompt')
    }
    if (!threadId) {
      throw new Error('Missing threadId for assistant completion')
    }

    this.logger.info(`running assistant on thread ${threadId}`)

    const priorMessages = messageId
      ? (existingMessages ?? []).filter((m) => m.id !== messageId)
      : (existingMessages ?? [])

    const messages = this.buildMessages({
      systemPrompt,
      candidateContext,
      priorMessages,
      userContent: message.content,
    })

    const result = await this.llm.chatCompletion({
      messages,
      maxTokens: AI_CHAT_MAX_TOKENS,
      temperature: AI_CHAT_TEMPERATURE,
      topP: AI_CHAT_TOP_P,
    })

    return {
      role: 'assistant',
      content: formatHtmlLlmResponse(result.content),
      id: crypto.randomUUID(),
      createdAt: new Date().valueOf(),
      usage: result.tokens,
    }
  }

  private buildMessages({
    systemPrompt,
    candidateContext,
    priorMessages,
    userContent,
  }: {
    systemPrompt: string
    candidateContext: string
    priorMessages: AiChatMessage[]
    userContent: string
  }): ChatCompletionMessageParam[] {
    if (!systemPrompt) {
      throw new Error('Missing required param: systemPrompt')
    }
    return [
      {
        role: 'system',
        content: `${systemPrompt}\n${candidateContext}\n\n${MARKDOWN_FORMAT_DIRECTIVE}`,
      },
      ...priorMessages
        .map(toChatCompletionMessage)
        .filter(isChatCompletionMessage),
      { role: 'user', content: userContent },
    ]
  }

  /**
   * Streaming variant of the assistant chat. Yields incremental text deltas
   * (SSE-friendly), persists the completed exchange to the AiChat JSON blob,
   * then emits a terminal `done` (or `error`) chunk. Mirrors the briefing
   * chat streaming contract but keeps the existing AiChat storage model.
   *
   * Assistant content is stored as raw markdown (not HTML) so the client can
   * render it incrementally and on reload via the same markdown pipeline.
   */
  async *streamChat(
    campaign: PromptReplaceCampaign,
    body: StreamAiChatSchema,
    liveMetrics?: RaceTargetMetrics | null,
    signal?: AbortSignal,
  ): AsyncGenerator<CampaignChatChunk, void, void> {
    const userId = campaign.user?.id
    if (!userId) {
      yield this.streamError('internal', 'Campaign has no associated user.')
      return
    }

    const { initial } = body

    let resolved: {
      threadId: string
      isNewThread: boolean
      existingId?: number
      existingData?: object
      priorMessages: AiChatMessage[]
      userMessage: AiChatMessage
    }
    try {
      resolved = await this.resolveStreamThread(userId, body)
    } catch (err) {
      this.logger.error({ err }, 'failed to resolve campaign chat thread')
      yield this.streamError('internal', 'Chat thread is unavailable.')
      return
    }

    const { candidateJson, systemPrompt } =
      await this.contentService.getChatSystemPrompt(
        resolved.isNewThread && initial,
      )
    const candidateContext = await this.promptReplaceService.promptReplace(
      candidateJson,
      campaign,
      liveMetrics,
    )

    const messages = this.buildMessages({
      systemPrompt,
      candidateContext,
      priorMessages: resolved.priorMessages,
      userContent: resolved.userMessage.content,
    })

    let result: LlmStreamResult
    try {
      result = await this.llm.streamChatCompletion({
        messages,
        temperature: AI_CHAT_TEMPERATURE,
        topP: AI_CHAT_TOP_P,
        maxOutputTokens: AI_CHAT_MAX_TOKENS,
        ...(signal && { abortSignal: signal }),
      })
    } catch (err) {
      this.logger.error(
        { err, threadId: resolved.threadId },
        'campaign chat stream connect failed',
      )
      yield this.classifyStreamError(err, signal)
      return
    }

    const parts: string[] = []
    try {
      for await (const delta of result.textStream) {
        if (signal?.aborted) break
        parts.push(delta)
        yield { type: 'text', delta }
      }
    } catch (err) {
      this.logger.error(
        { err, threadId: resolved.threadId },
        'campaign chat stream iteration failed',
      )
      yield this.classifyStreamError(err, signal)
      return
    }

    if (signal?.aborted) {
      yield this.streamError('aborted', 'Stream cancelled.', false)
      return
    }

    const assistantMessage: AiChatMessage = {
      role: 'assistant',
      content: parts.join(''),
      id: crypto.randomUUID(),
      createdAt: new Date().valueOf(),
    }

    try {
      await this.persistStreamedExchange(campaign, userId, resolved, [
        ...resolved.priorMessages,
        resolved.userMessage,
        assistantMessage,
      ])
    } catch (err) {
      this.logger.error(
        { err, threadId: resolved.threadId },
        'failed to persist streamed campaign chat',
      )
      yield this.streamError('internal', 'Failed to save the chat.')
      return
    }

    yield {
      type: 'done',
      threadId: resolved.threadId,
      message: assistantMessage,
    }
  }

  private async resolveStreamThread(
    userId: number,
    { threadId, message, regenerate }: StreamAiChatSchema,
  ): Promise<{
    threadId: string
    isNewThread: boolean
    existingId?: number
    existingData?: object
    priorMessages: AiChatMessage[]
    userMessage: AiChatMessage
  }> {
    if (!threadId) {
      if (!message) {
        throw new Error('Message is required to start a chat')
      }
      return {
        threadId: crypto.randomUUID(),
        isNewThread: true,
        priorMessages: [],
        userMessage: {
          role: 'user',
          content: message,
          id: crypto.randomUUID(),
          createdAt: new Date().valueOf(),
        },
      }
    }

    const existing = await this.findFirstOrThrow({
      where: { threadId, userId },
    })
    const existingData = existing.data as { messages: AiChatMessage[] }
    const priorMessages = [...(existingData.messages ?? [])]

    let userMessage: AiChatMessage
    if (regenerate) {
      priorMessages.pop() // drop last assistant response
      const lastUser = priorMessages.pop() // re-send the last user message
      if (!lastUser) {
        throw new Error('Cannot regenerate: no prior user message')
      }
      userMessage = lastUser
    } else {
      if (!message) {
        throw new Error('Message is required')
      }
      userMessage = {
        role: 'user',
        content: message,
        id: crypto.randomUUID(),
        createdAt: new Date().valueOf(),
      }
    }

    return {
      threadId,
      isNewThread: false,
      existingId: existing.id,
      existingData,
      priorMessages,
      userMessage,
    }
  }

  private async persistStreamedExchange(
    campaign: PromptReplaceCampaign,
    userId: number,
    resolved: {
      threadId: string
      isNewThread: boolean
      existingId?: number
      existingData?: object
    },
    messages: AiChatMessage[],
  ): Promise<void> {
    if (resolved.isNewThread) {
      await this.model.create({
        data: {
          assistant: LLAMA_AI_ASSISTANT,
          threadId: resolved.threadId,
          userId,
          campaignId: campaign.id,
          data: { messages },
        },
      })
      return
    }
    await this.model.update({
      where: { id: resolved.existingId },
      data: {
        data: { ...(resolved.existingData ?? {}), messages },
      },
    })
  }

  private streamError(
    code: CampaignChatErrorCode,
    message: string,
    retryable: boolean = code === 'upstream_unavailable' ||
      code === 'rate_limited',
  ): CampaignChatChunk {
    return { type: 'error', code, message, retryable }
  }

  private classifyStreamError(
    err: unknown,
    signal?: AbortSignal,
  ): CampaignChatChunk {
    const isAbort =
      signal?.aborted === true ||
      (err instanceof Error && err.name === 'AbortError')
    if (isAbort) {
      return this.streamError('aborted', 'Stream cancelled.', false)
    }

    const status = getErrorStatus(err)
    const text = err instanceof Error ? err.message : String(err)

    if (status === 429 || /\b429\b|rate.?limit/i.test(text)) {
      return this.streamError(
        'rate_limited',
        'Too many requests. Please wait and try again.',
      )
    }
    if (isUpstreamFailure(status, text)) {
      return this.streamError(
        'upstream_unavailable',
        'Chat is temporarily unavailable.',
      )
    }
    return this.streamError('internal', 'Chat failed. Please try again.', false)
  }

  delete(threadId: string, userId: number) {
    return this.model.delete({
      where: {
        threadId,
        userId,
      },
    })
  }

  async feedback(
    user: User,
    threadId: string,
    { type, message }: AiChatFeedbackSchema,
  ) {
    const aiChat = await this.findFirstOrThrow({
      where: {
        threadId,
        userId: user.id,
      },
    })
    const chatData = aiChat.data as { messages: AiChatMessage[] }

    await this.model.update({
      where: { id: aiChat.id },
      data: {
        data: {
          ...chatData,
          feedback: {
            type,
            message,
          },
        },
      },
    })

    const lastMsgIndex = chatData.messages.length - 1
    const slackBlocks = buildSlackBlocks(
      type,
      user.email,
      threadId,
      message,
      chatData.messages[lastMsgIndex - 1]?.content,
      chatData.messages[lastMsgIndex]?.content,
    )

    await this.slack.message(slackBlocks, SlackChannel.userFeedback)

    return true
  }
}
