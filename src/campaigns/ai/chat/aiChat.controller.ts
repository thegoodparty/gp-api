import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { PromptReplaceCampaign } from 'src/ai/ai.service'
import { PinoLogger } from 'nestjs-pino'

@Controller('campaigns/ai/chat')
@UsePipes(ZodValidationPipe)
export class AiChatController {
  constructor(
    private aiChatService: AiChatService,
    private campaigns: CampaignsService,
    private slack: SlackService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AiChatController.name)
  }

  @Get()
  async list(@ReqUser() { id: userId }: User) {
    const aiChats = await this.aiChatService.findMany({ where: { userId } })

    const chats: { threadId: string; updatedAt: Date; name: string }[] = []
    for (const chat of aiChats) {
      if (!chat.threadId) continue
      const chatData = chat.data
      chats.push({
        threadId: chat.threadId,
        updatedAt: chat.updatedAt,
        name: chatData.messages?.length > 0 ? chatData.messages[0].content : '',
      })
    }

    return { chats }
  }

  @Get(':threadId')
  async get(
    @ReqUser() { id: userId }: User,
    @Param('threadId') threadId: string,
  ) {
    const aiChat = await this.aiChatService.findUniqueOrThrow({
      where: { threadId, userId },
    })
    const chatData = aiChat.data

    return {
      chat: chatData.messages,
      feedback: chatData.feedback,
    }
  }

  @Post()
  @UseCampaign({
    include: {
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
      const liveMetrics =
        await this.campaigns.fetchLiveRaceTargetMetrics(campaign)
      return await this.aiChatService.create(campaign, body, liveMetrics)
    } catch (error) {
      this.logger.error({ e: error }, 'Error generating AI chat')
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error,
      })
      this.logApiErrorData(error)
      throw error
    }
  }

  @Put(':threadId')
  @UseCampaign({
    include: {
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
      const liveMetrics =
        await this.campaigns.fetchLiveRaceTargetMetrics(campaign)
      return await this.aiChatService.update(
        threadId,
        campaign,
        body,
        liveMetrics,
      )
    } catch (error) {
      this.logger.error({ e: error }, 'Error generating AI chat')
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error,
      })
      this.logApiErrorData(error)
      throw error
    }
  }

  @Delete(':threadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @ReqUser() { id: userId }: User,
    @Param('threadId') threadId: string,
  ) {
    try {
      return await this.aiChatService.delete(threadId, userId)
    } catch (e) {
      this.logger.error({ e }, 'Error at ai/chat/delete')
      throw e
    }
  }

  @Post(':threadId/feedback')
  @HttpCode(HttpStatus.NO_CONTENT)
  async feedback(
    @ReqUser() user: User,
    @Param('threadId') threadId: string,
    @Body() body: AiChatFeedbackSchema,
  ) {
    try {
      return await this.aiChatService.feedback(user, threadId, body)
    } catch (error) {
      this.logger.error({ e: error }, 'Error giving AI chat feedback')
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error,
      })
      this.logApiErrorData(error)
      throw error
    }
  }

  private logApiErrorData(error: unknown) {
    if (error == null || typeof error !== 'object') return
    if (
      !('data' in error) ||
      error.data == null ||
      typeof error.data !== 'object'
    )
      return
    if (!('error' in error.data) || typeof error.data.error !== 'string') return
    this.logger.error({ error: error.data.error }, '*** error*** :')
  }
}
