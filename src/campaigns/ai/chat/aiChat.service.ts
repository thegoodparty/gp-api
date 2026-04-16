import { Injectable } from '@nestjs/common'
import { CreateAiChatSchema } from './schemas/CreateAiChat.schema'
import { AiService, PromptReplaceCampaign } from 'src/ai/ai.service'
import { ContentService } from 'src/content/services/content.service'
import { RaceTargetMetrics } from 'src/elections/types/elections.types'
import { UpdateAiChatSchema } from './schemas/UpdateAiChat.schema'
import { AiChatMessage } from './aiChat.types'
import { AiChatFeedbackSchema } from './schemas/AiChatFeedback.schema'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { User } from '@prisma/client'
import { buildSlackBlocks } from './util/buildSlackBlocks.util'
import { SlackChannel } from '../../../vendors/slack/slackService.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { requireEnv } from 'src/shared/util/env.util'

const LLAMA_AI_ASSISTANT = requireEnv('LLAMA_AI_ASSISTANT')

@Injectable()
export class AiChatService extends createPrismaBase(MODELS.AiChat) {
  constructor(
    private aiService: AiService,
    private contentService: ContentService,
    private slack: SlackService,
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

    const candidateContext = await this.aiService.promptReplace(
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

    // TODO: these aren't used (threadId is always created, just use const assignment)
    let threadId: string | undefined
    let messageId: string | undefined

    if (!threadId) {
      this.logger.info('creating thread')
      threadId = crypto.randomUUID()
      this.logger.info({ threadId }, 'threadId')
    }

    this.logger.info({ candidateContext }, 'candidateContext')
    this.logger.info({ systemPrompt }, 'systemPrompt')

    const completion = await this.aiService.getAssistantCompletion({
      systemPrompt,
      candidateContext,
      assistantId: LLAMA_AI_ASSISTANT,
      threadId,
      message: chatMessage,
      messageId: messageId!,
    })

    this.logger.info({ completion }, 'completion')

    const chatResponse: AiChatMessage = {
      role: 'assistant',
      id: completion.id,
      content: completion.content,
      createdAt: completion.createdAt,
      usage: completion.usage,
    }

    if (!campaign.user?.id) {
      throw new Error('Campaign has no associated user')
    }
    await this.model.create({
      data: {
        assistant: LLAMA_AI_ASSISTANT,
        threadId: completion.threadId,
        userId: campaign.user.id,
        campaignId: campaign.id,
        data: {
          messages: [chatMessage, chatResponse],
        },
      },
    })
    return {
      chat: [chatMessage, chatResponse],
      threadId: completion.threadId,
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

    const candidateContext = await this.aiService.promptReplace(
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

    const completion = await this.aiService.getAssistantCompletion({
      systemPrompt,
      candidateContext,
      assistantId: LLAMA_AI_ASSISTANT,
      threadId,
      message: chatMessage,
      messageId: messageId!,
      existingMessages: messages,
    })

    this.logger.info({ completion }, 'completion')

    const chatResponse: AiChatMessage = {
      role: 'assistant',
      id: completion.id,
      content: completion.content,
      createdAt: completion.createdAt,
      usage: completion.usage,
    }

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
