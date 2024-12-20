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
import { CampaignsAiService } from './campaignsAi.service'
import { RenameAiContentSchema } from './schemas/RenameAiContent.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { Campaign } from '@prisma/client'
import { CreateAiContentSchema } from './schemas/CreateAiContent.schema'
import { FastifyReply } from 'fastify'
import { CampaignsService } from '../services/campaigns.service'
import { CampaignAiContent } from '../campaigns.types'
import { UserCampaign } from '../decorators/UserCampaign.decorator'
import { RequireCampaign } from '../decorators/RequireCampaign.decorator'

@Controller('campaigns/ai')
@RequireCampaign()
@UsePipes(ZodValidationPipe)
export class CampaignsAiController {
  private readonly logger = new Logger(CampaignsAiController.name)

  constructor(
    private campaignsAiService: CampaignsAiService,
    private campaignsService: CampaignsService,
  ) {}

  @Post() // campaign/ai/create.js
  async create(
    @Res({ passthrough: true }) res: FastifyReply,
    @UserCampaign() campaign: Campaign,
    @Body() body: CreateAiContentSchema,
  ) {
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
    @UserCampaign() campaign: Campaign,
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
  async delete(@UserCampaign() campaign: Campaign, @Param('key') key: string) {
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
