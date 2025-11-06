import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
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
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { PromptReplaceCampaign } from 'src/ai/ai.service'

@Controller('campaigns/ai/chat')
@UsePipes(ZodValidationPipe)
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name)

  constructor(
    private aiChatService: AiChatService,
    private slack: SlackService,
  ) {}

  @Get()
  async list(@ReqUser() { id: userId }: User) {
    const aiChats = await this.aiChatService.findMany({ where: { userId } })

    const chats: { threadId: string; updatedAt: Date; name: string }[] = []
    for (const chat of aiChats) {
      const chatData = chat.data
      chats.push({
        threadId: chat.threadId as string,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      this.logger.error('Error generating AI chat', { error: e })
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error: e,
      })
      if (e.data && e.data.error) {
        this.logger.error('*** error*** :', { error: e.data.error })
      }

      throw e
    }
  }

  @Put(':threadId')
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      this.logger.error('Error generating AI chat', e)
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error: e,
      })
      if (e.data && e.data.error) {
        this.logger.error('*** error*** :', e.data.error)
      }

      throw e
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
      this.logger.error('Error at ai/chat/delete', e)
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (e: any) {
      this.logger.error('Error giving AI chat feedback', e)
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error: e,
      })
      if (e.data && e.data.error) {
        this.logger.log('*** error*** :', e.data.error)
      }
      throw e
    }
  }
}
