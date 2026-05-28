import { Injectable } from '@nestjs/common'
import { CreateAiChatSchema } from './schemas/CreateAiChat.schema'
import {
  PromptReplaceCampaign,
  PromptReplaceService,
} from 'src/ai/services/promptReplace.service'
import { LlmService } from '@/llm/services/llm.service'
import { formatHtmlLlmResponse } from '@/ai/util/llmResponseFormat.util'
import { ContentService } from 'src/content/services/content.service'
import { RaceTargetMetrics } from 'src/elections/types/elections.types'
import { UpdateAiChatSchema } from './schemas/UpdateAiChat.schema'
import { AiChatMessage } from './aiChat.types'
import { AiChatFeedbackSchema } from './schemas/AiChatFeedback.schema'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { User } from '@prisma/client'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { buildSlackBlocks } from './util/buildSlackBlocks.util'
import { SlackChannel } from '../../../vendors/slack/slackService.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { requireEnv } from 'src/shared/util/env.util'

const LLAMA_AI_ASSISTANT = requireEnv('LLAMA_AI_ASSISTANT')
const AI_CHAT_MAX_TOKENS = 500
const AI_CHAT_TEMPERATURE = 0.7
const AI_CHAT_TOP_P = 0.1

const toChatCompletionMessage = (
  m: AiChatMessage,
): ChatCompletionMessageParam => {
  switch (m.role) {
    case 'system':
      return { role: 'system', content: m.content }
    case 'user':
      return { role: 'user', content: m.content }
    case 'assistant':
      return { role: 'assistant', content: m.content }
  }
}

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
    this.logger.info({ candidateContext }, 'candidateContext')
    this.logger.info({ systemPrompt }, 'systemPrompt')

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

    const messages: ChatCompletionMessageParam[] = [
      { role: 'system', content: `${systemPrompt}\n${candidateContext}` },
      ...priorMessages.map(toChatCompletionMessage),
      { role: 'user', content: message.content },
    ]

    this.logger.info({ messages }, 'messages')

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
