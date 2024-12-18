import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Res,
  UsePipes,
} from '@nestjs/common'
import { CampaignsAiService } from './campaignsAi.service'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { RenameAiContentSchema } from './schemas/RenameAiContent.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { User } from '@prisma/client'
import { CreateAiContentSchema } from './schemas/CreateAiContent.schema'
import { FastifyReply } from 'fastify'

@Controller('campaigns/ai')
@UsePipes(ZodValidationPipe)
export class CampaignsAiController {
  constructor(private aiService: CampaignsAiService) {}

  @Post()
  async create(
    @Res({ passthrough: true }) res: FastifyReply,
    @ReqUser() user: User,
    @Body() body: CreateAiContentSchema,
  ) {
    const result = await this.aiService.createContent(user.id, body)

    if (result.created) {
      res.statusCode = HttpStatus.CREATED
    } else {
      res.statusCode = HttpStatus.OK
    }

    return result
  }

  @Put('rename')
  @HttpCode(HttpStatus.OK)
  rename(@ReqUser() user: User, @Body() body: RenameAiContentSchema) {
    return this.aiService.updateContentName(user.id, body)
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@ReqUser() user: User, @Param('key') key: string) {
    return this.aiService.deleteContent(user.id, key)
  }
}
