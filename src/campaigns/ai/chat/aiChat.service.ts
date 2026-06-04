import { Injectable } from '@nestjs/common'
import { CreateAiChatSchema } from './schemas/CreateAiChat.schema'
import {
  PromptReplaceCampaign,
  PromptReplaceService,
} from 'src/ai/services/promptReplace.service'
import { LlmService, LlmStreamResult } from '@/llm/services/llm.service'
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
import { z } from 'zod'
import {
  isInternalChatLink,
  sanitizeChatLinks,
  validateChatLinks,
} from './util/sanitizeChatLinks.util'
import { sanitizeUntrustedContent } from '@/ai/util/sanitizePromptInput.util'

const LLAMA_AI_ASSISTANT = requireEnv('LLAMA_AI_ASSISTANT')
const AI_CHAT_MAX_TOKENS = 2000
const AI_CHAT_TEMPERATURE = 0.7
const AI_CHAT_TOP_P = 0.9

// Cap how many prior turns we replay to the model. Bounds latency, cost, and
// context-window risk on long threads. We still persist the full history — only
// the messages SENT to the model are trimmed (most recent kept).
const MAX_HISTORY_MESSAGES = 20

// Budget for the post-answer metadata call (follow-up questions + thread
// title). Kept small and best-effort: failures never block the reply.
const METADATA_MAX_TOKENS = 200

// Timeout for the per-link reachability check (HEAD request). Kept short so a
// slow/hanging host can't stall the final answer; checks run in parallel.
const LINK_CHECK_TIMEOUT_MS = 2500

const ChatMetadataSchema = z.object({
  followups: z.array(z.string().min(1)).max(3).default([]),
  title: z.string().max(80).optional(),
})

// The CMS-managed prompt historically asks the model to emit HTML (for the
// shared content-generation/Quill path). The chat now renders Markdown via
// react-markdown, so we append a final, authoritative formatting directive
// that overrides any HTML guidance from the CMS prompt. Placed last in the
// system message so it takes precedence.
const MARKDOWN_FORMAT_DIRECTIVE = `Formatting requirements (these override any earlier or conflicting formatting instructions):
- Respond using GitHub-flavored Markdown ONLY. Do not output raw HTML tags (no <p>, <ul>, <li>, <a>, <br>, <strong>, etc.).
- Use **bold**, *italics*, \`inline code\`, fenced code blocks, bullet and numbered lists, ## headings, tables, and Markdown links in the form [label](https://example.com).`

// Code-side length directive. Complements the CMS prompt (and the 2000-token
// cap) so answers are thorough and actionable without being padded. Placed
// after the formatting directive so both take precedence over CMS brevity
// guidance.
const RESPONSE_LENGTH_DIRECTIVE = `Response depth:
- Give a complete, useful answer: explain the why, then concrete, specific next steps the candidate can act on.
- Prefer a short intro followed by structured detail (lists, steps, or a brief table) over a one-line reply.
- Be thorough but not padded — no filler, repetition, or restating the question.`

// Threads created before this PR stored assistant content as HTML
// (formatHtmlLlmResponse turned \n into <br/><br/>). Strip those artifacts
// before replaying history to the model so it follows the Markdown directive
// instead of mimicking the HTML present in prior turns. The tag removal repeats
// until the string is stable so overlapping/nested tags (e.g. "<<b>b>") can't
// leave a partial tag behind (a single pass is an incomplete sanitization).
const stripLegacyHtml = (content: string): string => {
  let result = content.replace(/<br\s*\/?>/gi, '\n')
  let previous: string
  do {
    previous = result
    result = result.replace(/<[^>]*>/g, '')
  } while (result !== previous)
  return result
}

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
    l2DistrictName?: string | null,
  ) {
    // Create a new chat
    const { candidateJson, systemPrompt } =
      await this.contentService.getChatSystemPrompt(initial)

    const candidateContext = await this.promptReplaceService.promptReplace(
      candidateJson,
      campaign,
      liveMetrics,
      l2DistrictName,
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
    l2DistrictName?: string | null,
  ) {
    if (regenerate && !threadId) {
      throw new Error('Cannot regenerate without threadId')
    }

    const aiChat = await this.findFirstOrThrow({
      where: {
        threadId,
        userId: campaign.user?.id,
        campaignId: campaign.id,
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
      l2DistrictName,
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

    // Store raw Markdown in every path. The HTML post-processor
    // (formatHtmlLlmResponse) would mangle the Markdown the model now emits and
    // would mix HTML/Markdown across the shared thread store (a thread started
    // here and continued via streamChat, or vice versa).
    return {
      role: 'assistant',
      content: await this.sanitizeAndValidateLinks(result.content),
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
    // Only replay the most recent turns to the model (full history is still
    // persisted elsewhere). Slicing the tail keeps the latest context.
    const recentHistory = priorMessages.slice(-MAX_HISTORY_MESSAGES)

    return [
      {
        role: 'system',
        // candidateContext is built from user-entered campaign details, so it's
        // untrusted — strip role/template delimiters before embedding it.
        content: `${systemPrompt}\n${sanitizeUntrustedContent(candidateContext)}\n\n${MARKDOWN_FORMAT_DIRECTIVE}\n\n${RESPONSE_LENGTH_DIRECTIVE}`,
      },
      ...recentHistory
        .map((m) =>
          m.role === 'assistant' && typeof m.content === 'string'
            ? { ...m, content: stripLegacyHtml(m.content) }
            : { ...m, content: sanitizeUntrustedContent(m.content) },
        )
        .map(toChatCompletionMessage)
        .filter(isChatCompletionMessage),
      { role: 'user', content: sanitizeUntrustedContent(userContent) },
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
    l2DistrictName?: string | null,
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
      resolved = await this.resolveStreamThread(userId, campaign.id, body)
    } catch (err) {
      this.logger.error({ err }, 'failed to resolve campaign chat thread')
      yield this.streamError('internal', 'Chat thread is unavailable.')
      return
    }

    let messages: ChatCompletionMessageParam[]
    try {
      const { candidateJson, systemPrompt } =
        await this.contentService.getChatSystemPrompt(
          resolved.isNewThread && initial,
        )
      const candidateContext = await this.promptReplaceService.promptReplace(
        candidateJson,
        campaign,
        liveMetrics,
        l2DistrictName,
      )

      messages = this.buildMessages({
        systemPrompt,
        candidateContext,
        priorMessages: resolved.priorMessages,
        userContent: resolved.userMessage.content,
      })
    } catch (err) {
      // Keep prompt-build failures inside the generator so the client gets a
      // classified `internal` chunk instead of the controller's generic
      // last-resort error (which would otherwise diverge on the retryable flag).
      this.logger.error(
        { err, threadId: resolved.threadId },
        'failed to build campaign chat prompt',
      )
      yield this.streamError('internal', 'Chat is unavailable.')
      return
    }

    let result: LlmStreamResult
    try {
      result = await this.llm.streamChatCompletion({
        messages,
        models: this.llm.getChatModelChain(),
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

    // Empty-answer guard: a blank/whitespace completion should surface a
    // retryable error rather than persisting an empty assistant bubble.
    const rawAnswer = parts.join('')
    if (!rawAnswer.trim()) {
      this.logger.warn(
        { threadId: resolved.threadId },
        'campaign chat produced an empty answer',
      )
      yield this.streamError(
        'upstream_unavailable',
        'No response was generated. Please try again.',
      )
      return
    }

    // Link safety net: downgrade unsafe links + strip tracking params, then
    // drop internal links that 404 (the model sometimes fabricates plausible
    // goodparty.org URLs). Streamed deltas were raw; the client commits
    // `done.message.content`, so the final rendered + stored answer is clean.
    const answer = await this.sanitizeAndValidateLinks(rawAnswer)
    const usage = await result.usage.catch(() => null)

    const { followups, title } = await this.generateChatMetadata({
      userContent: resolved.userMessage.content,
      assistantContent: answer,
      isNewThread: resolved.isNewThread,
      signal,
    })

    const assistantMessage: AiChatMessage = {
      role: 'assistant',
      content: answer,
      id: crypto.randomUUID(),
      createdAt: new Date().valueOf(),
      ...(usage?.totalTokens ? { usage: usage.totalTokens } : {}),
      ...(followups.length ? { followups } : {}),
    }

    try {
      await this.persistStreamedExchange(
        campaign,
        userId,
        resolved,
        [...resolved.priorMessages, resolved.userMessage, assistantMessage],
        title,
      )
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

  /**
   * Best-effort post-answer metadata: 2-3 suggested follow-up questions (phrased
   * from the user's perspective) and, for new threads, a short title for the
   * history sidebar. Runs as a small JSON completion; any failure degrades
   * gracefully to no follow-ups / no title and never blocks the reply.
   */
  private async generateChatMetadata({
    userContent,
    assistantContent,
    isNewThread,
    signal,
  }: {
    userContent: string
    assistantContent: string
    isNewThread: boolean
    signal?: AbortSignal
  }): Promise<{ followups: string[]; title?: string }> {
    if (signal?.aborted) return { followups: [] }
    try {
      const titleInstruction = isNewThread
        ? '\n- "title": a concise (<= 6 word) title summarizing this conversation topic.'
        : ''
      const { object } = await this.llm.jsonCompletion({
        schema: ChatMetadataSchema,
        maxTokens: METADATA_MAX_TOKENS,
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content:
              'You generate UI metadata for a political campaign assistant. ' +
              'Return ONLY a JSON object with:\n' +
              '- "followups": an array of 2-3 short, natural follow-up questions ' +
              'the user (a candidate) might ask next, phrased in first person ' +
              '(e.g. "How do I find volunteers?"). Keep each under 12 words.' +
              titleInstruction,
          },
          {
            role: 'user',
            content: `User asked:\n${userContent}\n\nAssistant answered:\n${assistantContent}`,
          },
        ],
      })
      return {
        followups: object.followups ?? [],
        ...(isNewThread && object.title?.trim()
          ? { title: object.title.trim() }
          : {}),
      }
    } catch (err) {
      this.logger.warn({ err }, 'failed to generate chat metadata')
      return { followups: [] }
    }
  }

  /**
   * Final link pass for an assistant answer: sanitize unsafe links + strip
   * tracking params, then downgrade internal (goodparty.org) links that don't
   * resolve to plain text. Validation is scoped to internal hosts to bound
   * latency and avoid an SSRF surface for arbitrary external URLs.
   */
  private async sanitizeAndValidateLinks(raw: string): Promise<string> {
    const sanitized = sanitizeChatLinks(raw)
    try {
      return await validateChatLinks(sanitized, (url) =>
        this.isLinkReachable(url),
      )
    } catch (err) {
      // Never let link validation break the answer — fall back to the
      // sanitized (but unvalidated) text.
      this.logger.warn({ err }, 'chat link validation failed')
      return sanitized
    }
  }

  /**
   * Reachability check used by link validation. Only internal goodparty.org
   * links are actually fetched (HEAD, short timeout); external links are
   * assumed reachable so we don't add latency or probe arbitrary hosts.
   */
  private async isLinkReachable(url: string): Promise<boolean> {
    if (!isInternalChatLink(url)) return true
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
      })
      // Some hosts reject HEAD (405) — confirm with a lightweight GET before
      // declaring the link dead.
      if (res.status === 405) {
        const getRes = await fetch(url, {
          method: 'GET',
          redirect: 'follow',
          signal: AbortSignal.timeout(LINK_CHECK_TIMEOUT_MS),
        })
        return getRes.status < 400
      }
      return res.status < 400
    } catch (err) {
      // Network error / timeout: don't strip on uncertainty (avoid false
      // positives from transient failures).
      this.logger.debug({ err, url }, 'link reachability check failed')
      return true
    }
  }

  private async resolveStreamThread(
    userId: number,
    campaignId: number,
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

    // Scope by campaignId too: without it a user who owns multiple campaigns
    // could continue/regenerate a thread from a different campaign under the
    // wrong campaign's context.
    const existing = await this.findFirstOrThrow({
      where: { threadId, userId, campaignId },
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
    title?: string,
  ): Promise<void> {
    if (resolved.isNewThread) {
      await this.model.create({
        data: {
          assistant: LLAMA_AI_ASSISTANT,
          threadId: resolved.threadId,
          userId,
          campaignId: campaign.id,
          data: { messages, ...(title ? { title } : {}) },
        },
      })
      return
    }
    await this.model.update({
      where: { id: resolved.existingId },
      data: {
        // Preserve an existing title; only set one when generated for a thread
        // that doesn't have one yet.
        data: {
          ...(resolved.existingData ?? {}),
          messages,
          ...(title ? { title } : {}),
        },
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
