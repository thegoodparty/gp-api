import {
  Body,
  Controller,
  Delete,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
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
// @UseGuards(CampaignOwnersOrAdminGuard) // TODO: need guard to check user has campaign?
export class CampaignsAiController {
  constructor(private aiService: CampaignsAiService) {}

  @Post()
  async create(
    @Req() req: FastifyReply,
    @ReqUser() user: User,
    @Body() body: CreateAiContentSchema,
  ) {
    const result = await this.aiService.createContent(user.id, body)

    if (result.step === 'created') {
      req.statusCode = HttpStatus.CREATED
    } else {
      req.statusCode = HttpStatus.OK
    }

    return result
  }

  @Post('rename')
  rename(@ReqUser() user: User, @Body() body: RenameAiContentSchema) {
    return this.aiService.updateContentName(user.id, body)
  }

  @Delete(':key')
  delete(@ReqUser() user: User, @Param('key') key: string) {
    return this.aiService.deleteContent(user.id, key)
  }
}
