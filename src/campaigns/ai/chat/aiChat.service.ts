import { Injectable } from '@nestjs/common'
import { CreateAiChatSchema } from './schemas/CreateAiChat.schema'
import { AiService, PromptReplaceCampaign } from 'src/ai/ai.service'
import { ContentService } from 'src/content/services/content.service'
import { UpdateAiChatSchema } from './schemas/UpdateAiChat.schema'
import { AiChatMessage } from './aiChat.types'
import { AiChatFeedbackSchema } from './schemas/AiChatFeedback.schema'
import { SlackService } from 'src/shared/services/slack.service'
import { User } from '@prisma/client'
import { buildSlackBlocks } from './util/buildSlackBlocks.util'
import { SlackChannel } from '../../../shared/services/slackService.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

const LLAMA_AI_ASSISTANT = process.env.LLAMA_AI_ASSISTANT as string

if (!LLAMA_AI_ASSISTANT) {
  throw new Error('Please set LLAMA_AI_ASSISTANT in your .env')
}

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
  ) {
    // Create a new chat
    const { candidateJson, systemPrompt } =
      await this.contentService.getChatSystemPrompt(initial)

    const candidateContext = await this.aiService.promptReplace(
      candidateJson,
      campaign,
    )

    const chatMessage: AiChatMessage = {
      role: 'user',
      content: message,
      id: crypto.randomUUID(),
      createdAt: new Date().valueOf(),
    }

    // TODO: these aren't used (threadId is always created, just use const assignment)
    let threadId
    let messageId

    if (!threadId) {
      this.logger.log('creating thread')
      threadId = crypto.randomUUID()
      this.logger.log('threadId', threadId)
    }

    this.logger.log('candidateContext', candidateContext)
    this.logger.log('systemPrompt', systemPrompt)

    const completion = await this.aiService.getAssistantCompletion({
      systemPrompt,
      candidateContext,
      assistantId: LLAMA_AI_ASSISTANT,
      threadId,
      message: chatMessage,
      messageId,
    })

    this.logger.log('completion', completion)

    if (completion && completion?.content) {
      const chatResponse: AiChatMessage = {
        role: 'assistant',
        id: completion.id,
        content: completion.content,
        createdAt: completion.createdAt,
        usage: completion.usage,
      }

      await this.model.create({
        data: {
          assistant: LLAMA_AI_ASSISTANT,
          threadId: completion.threadId,
          userId: campaign.user?.id as number,
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
    } else {
      throw new Error('Failed to create')
    }
  }

  async update(
    threadId: string,
    campaign: PromptReplaceCampaign,
    { regenerate, message }: UpdateAiChatSchema,
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
    const messages = aiChat.data.messages

    const { candidateJson, systemPrompt } =
      await this.contentService.getChatSystemPrompt()

    const candidateContext = await this.aiService.promptReplace(
      candidateJson,
      campaign,
    )

    let messageId
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
      messageId,
      existingMessages: messages,
    })

    this.logger.log('completion', completion)

    let chatResponse
    if (completion && completion.content) {
      chatResponse = {
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
    } else {
      throw new Error('Failed to update')
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
    const chatData = aiChat.data

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
