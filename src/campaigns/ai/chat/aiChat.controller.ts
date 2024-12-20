import {
  Body,
  Controller,
  Delete,
  Get,
  Logger,
  Param,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common'
import { Campaign, User } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { AiChatFeedbackSchema } from './schemas/AiChatFeedback.schema'
import { UpdateAiChatSchema } from './schemas/UpdateAiChat.schema'
import { CreateAiChatSchema } from './schemas/CreateAiChat.schema'

@Controller('campaigns/ai/chat')
@UsePipes(ZodValidationPipe)
export class AiChatController {
  private readonly logger = new Logger(AiChatController.name)

  @Post() // campaign/ai/chat/create.js
  @UseCampaign()
  create(
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
    @Body() body: CreateAiChatSchema,
  ) {
    return { msg: 'create chat', user, campaign, body }
  }

  @Get() // campaign/ai/chat/get.js
  list(@ReqUser() user: User) {
    return { msg: 'get list of chats', user }
  }

  @Get(':threadId') // campaign/ai/chat/list.js
  get(@ReqUser() user: User, @Param('threadId') threadId: string) {
    return { msg: 'get chat', threadId, user }
  }

  @Put(':threadId') // campaign/ai/chat/update.js
  update(
    @ReqUser() user: User,
    @Param('threadId') threadId: string,
    @Body() body: UpdateAiChatSchema,
  ) {
    return { msg: 'update chat', threadId, user, body }
  }

  @Delete(':threadId') // campaign/ai/chat/delete.js
  delete(@ReqUser() user: User, @Param('threadId') threadId: string) {
    return { msg: 'delete chat', threadId, user }
  }

  @Post('feedback') // campaign/ai/chat/feedback.js
  feedback(@ReqUser() user: User, @Body() body: AiChatFeedbackSchema) {
    return { msg: 'feedback', body, user }
  }
}
