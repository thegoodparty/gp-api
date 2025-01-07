import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Res,
  UsePipes,
} from '@nestjs/common'
import { AiContentService } from './aiContent.service'
import { RenameAiContentSchema } from '../schemas/RenameAiContent.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { Campaign } from '@prisma/client'
import { CreateAiContentSchema } from '../schemas/CreateAiContent.schema'
import { FastifyReply } from 'fastify'
import { CampaignsService } from '../../services/campaigns.service'
import { CampaignAiContent } from '../../campaigns.types'
import { ReqCampaign } from '../../decorators/ReqCampaign.decorator'
import { UseCampaign } from '../../decorators/UseCampaign.decorator'

@Controller('campaigns/ai')
@UseCampaign()
@UsePipes(ZodValidationPipe)
export class AiContentController {
  private readonly logger = new Logger(AiContentController.name)

  constructor(
    private aiContentService: AiContentService,
    private campaignsService: CampaignsService,
  ) {}

  @Post() // campaign/ai/create.js
  async create(
    @Res({ passthrough: true }) res: FastifyReply,
    @ReqCampaign() campaign: Campaign,
    @Body() body: CreateAiContentSchema,
  ) {
    try {
      const result = await this.aiContentService.createContent(campaign, body)

      if (result.created) {
        res.statusCode = HttpStatus.CREATED
      } else {
        res.statusCode = HttpStatus.OK
      }

      return result
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e)
        throw new InternalServerErrorException('Failed to create content', {
          cause: e,
        })
      }

      throw e
    }
  }

  @Put('rename') // campaign/ai/rename.js
  @HttpCode(HttpStatus.OK)
  async rename(
    @ReqCampaign() campaign: Campaign,
    @Body() { key, name }: RenameAiContentSchema,
  ) {
    const { aiContent } = campaign

    if (!aiContent?.[key]) {
      throw new NotFoundException(`Content with key: ${key} not found`)
    }

    aiContent[key]['name'] = name

    return this.campaignsService.update(campaign.id, {
      aiContent,
    })
  }

  @Delete(':key') // campaign/ai/delete.js
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@ReqCampaign() campaign: Campaign, @Param('key') key: string) {
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
}
