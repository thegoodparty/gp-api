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
import { CampaignsService } from '../campaigns.service'

@Controller('campaigns/ai')
@UsePipes(ZodValidationPipe)
export class CampaignsAiController {
  constructor(
    private campaignsAiService: CampaignsAiService,
    private campaignsService: CampaignsService,
  ) {}

  @Post()
  async create(
    @Res({ passthrough: true }) res: FastifyReply,
    @ReqUser() { id: userId }: User,
    @Body() body: CreateAiContentSchema,
  ) {
    const campaign = await this.loadCampaign(userId)
    const result = await this.campaignsAiService.createContent(campaign, body)

    if (result.created) {
      res.statusCode = HttpStatus.CREATED
    } else {
      res.statusCode = HttpStatus.OK
    }

    return result
  }

  @Put('rename')
  @HttpCode(HttpStatus.OK)
  async rename(
    @ReqUser() { id: userId }: User,
    @Body() body: RenameAiContentSchema,
  ) {
    const campaign = await this.loadCampaign(userId)
    return this.campaignsAiService.updateContentName(campaign, body)
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@ReqUser() { id: userId }: User, @Param('key') key: string) {
    const campaign = await this.loadCampaign(userId)
    return this.campaignsAiService.deleteContent(campaign, key)
  }

  private loadCampaign(userId: number) {
    // TODO: use a decorator to inject needed campaign for user instead of this findByUser everywhere
    return this.campaignsService.findByUser(userId)
  }
}
