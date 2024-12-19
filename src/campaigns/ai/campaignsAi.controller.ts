import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
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
import { CampaignsService } from '../services/campaigns.service'
import { CampaignAiContent } from '../campaigns.types'

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

    try {
      const result = await this.campaignsAiService.createContent(campaign, body)

      if (result.created) {
        res.statusCode = HttpStatus.CREATED
      } else {
        res.statusCode = HttpStatus.OK
      }

      return result
    } catch (e) {
      if (e instanceof Error) {
        throw new InternalServerErrorException('Failed to create content')
      }

      throw e
    }
  }

  @Put('rename')
  @HttpCode(HttpStatus.OK)
  async rename(
    @ReqUser() { id: userId }: User,
    @Body() { key, name }: RenameAiContentSchema,
  ) {
    const campaign = await this.loadCampaign(userId)
    const { aiContent } = campaign

    if (!aiContent?.[key]) {
      throw new NotFoundException(`Content with key: ${key} not found`)
    }

    aiContent[key]['name'] = name

    return this.campaignsService.update(campaign.id, {
      aiContent,
    })
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@ReqUser() { id: userId }: User, @Param('key') key: string) {
    const campaign = await this.loadCampaign(userId)
    const aiContent = campaign.aiContent as CampaignAiContent

    if (!aiContent?.[key]) {
      // nothing to delete
      throw new NotFoundException('Content not found')
    }

    delete aiContent[key]
    delete aiContent.generationStatus?.[key]

    return this.campaignsService.update(campaign.id, {
      aiContent,
    })
  }

  private loadCampaign(userId: number) {
    // TODO: use a decorator to inject needed campaign for user instead of this findByUser everywhere
    return this.campaignsService.findByUser(userId)
  }
}
