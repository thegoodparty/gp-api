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
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { PromptReplaceCampaign } from 'src/ai/ai.service'
import { PinoLogger } from 'nestjs-pino'

@Controller('campaigns/ai/chat')
@UsePipes(ZodValidationPipe)
export class AiChatController {
  constructor(
    private aiChatService: AiChatService,
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
    } catch (error) {
      const e = error as Error & {
        data?: { error?: string }
      }
      this.logger.error({ e }, 'Error generating AI chat')
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error: e,
      })
      if (e.data?.error) {
        this.logger.error({ error: e.data.error }, '*** error*** :')
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
    } catch (error) {
      const e = error as Error & {
        data?: { error?: string }
      }
      this.logger.error({ e }, 'Error generating AI chat')
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error: e,
      })
      if (e.data?.error) {
        this.logger.error({ error: e.data.error }, '*** error*** :')
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
      const e = error as Error
      this.logger.error(e, 'Error giving AI chat feedback')
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error: e,
      })
      if (
        'data' in e &&
        (e as Error & { data?: { error?: string } }).data?.error
      ) {
        this.logger.info(
          { error: (e as Error & { data?: { error?: string } }).data!.error },
          '*** error*** :',
        )
      }
      throw e
    }
  }
}
