import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { AiChatFeedbackSchema } from './schemas/AiChatFeedback.schema'
import { UpdateAiChatSchema } from './schemas/UpdateAiChat.schema'
import { CreateAiChatSchema } from './schemas/CreateAiChat.schema'
import { AiChatService } from './aiChat.service'
import { SlackService } from 'src/shared/services/slack.service'
import { PromptReplaceCampaign } from 'src/ai/ai.service'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { AiChatData } from './aiChat.types'

@Controller('campaigns/ai/chat')
@UsePipes(ZodValidationPipe)
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name)

  constructor(
    private aiChatService: AiChatService,
    private slack: SlackService,
  ) {}

  @Get() // campaign/ai/chat/list.js
  async list(@ReqUser() { id: userId }: User) {
    const aiChats = await this.aiChatService.findAll(userId)

    const chats: { threadId: string; updatedAt: Date; name: string }[] = []
    for (const chat of aiChats) {
      const chatData = chat.data as AiChatData
      chats.push({
        threadId: chat.threadId as string,
        updatedAt: chat.updatedAt,
        name: chatData.messages?.length > 0 ? chatData.messages[0].content : '',
      })
    }

    return { chats }
  }

  @Get(':threadId') // campaign/ai/chat/get.js
  async get(
    @ReqUser() { id: userId }: User,
    @Param('threadId') threadId: string,
  ) {
    const aiChat = await this.aiChatService.findOneOrThrow(threadId, userId)
    const chatData = aiChat.data as AiChatData

    return {
      chat: chatData.messages,
      feedback: chatData.feedback,
    }
  }

  @Post() // campaign/ai/chat/create.js
  @UseCampaign({
    include: {
      pathToVictory: true,
      campaignPositions: {
        include: {
          topIssue: true,
          position: true,
        },
      },
      campaignUpdateHistory: true,
      user: true,
    },
  })
  async create(
    @ReqCampaign() campaign: PromptReplaceCampaign,
    @Body() body: CreateAiChatSchema,
  ) {
    try {
      return await this.aiChatService.create(campaign, body)
    } catch (e: any) {
      this.logger.error('Error generating AI chat', e)
      await this.slack.errorMessage('Error generating AI chat', e)
      if (e.data && e.data.error) {
        this.logger.error('*** error*** :', e.data.error)
      }

      throw e
    }
  }

  @Put(':threadId') // campaign/ai/chat/update.js
  @UseCampaign({
    include: {
      pathToVictory: true,
      campaignPositions: {
        include: {
          topIssue: true,
          position: true,
        },
      },
      campaignUpdateHistory: true,
      user: true,
    },
  })
  async update(
    @ReqCampaign() campaign: PromptReplaceCampaign,
    @Param('threadId') threadId: string,
    @Body() body: UpdateAiChatSchema,
  ) {
    try {
      return await this.aiChatService.update(threadId, campaign, body)
    } catch (e: any) {
      this.logger.error('Error generating AI chat', e)
      await this.slack.errorMessage('Error generating AI chat', e)
      if (e.data && e.data.error) {
        this.logger.error('*** error*** :', e.data.error)
      }

      throw e
    }
  }

  @Delete(':threadId') // campaign/ai/chat/delete.js
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @ReqUser() { id: userId }: User,
    @Param('threadId') threadId: string,
  ) {
    try {
      return await this.aiChatService.delete(threadId, userId)
    } catch (e) {
      this.logger.error('Error at ai/chat/delete', e)
      throw e
    }
  }

  @Post(':threadId/feedback') // campaign/ai/chat/feedback.js
  @HttpCode(HttpStatus.NO_CONTENT)
  async feedback(
    @ReqUser() user: User,
    @Param('threadId') threadId: string,
    @Body() body: AiChatFeedbackSchema,
  ) {
    try {
      return await this.aiChatService.feedback(user, threadId, body)
    } catch (e: any) {
      this.logger.error('Error giving AI chat feedback', e)
      await this.slack.errorMessage('Error generating AI chat', e)
      if (e.data && e.data.error) {
        this.logger.log('*** error*** :', e.data.error)
      }
      throw e
    }
  }
}
