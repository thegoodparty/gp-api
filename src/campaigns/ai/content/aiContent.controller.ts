import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Res,
  UsePipes,
} from '@nestjs/common'
import { AiContentService } from './aiContent.service'
import { RenameAiContentSchema } from '../schemas/RenameAiContent.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { Campaign, User, UserRole } from '@prisma/client'
import { CreateAiContentSchema } from '../schemas/CreateAiContent.schema'
import { FastifyReply } from 'fastify'
import { CampaignsService } from '../../services/campaigns.service'
import { ReqCampaign } from '../../decorators/ReqCampaign.decorator'
import { UseCampaign } from '../../decorators/UseCampaign.decorator'
import { GetSystemPromptSchema } from './schemas/GetSystemPrompt.schema'
import { ContentService } from 'src/content/services/content.service'
import { AiService, PromptReplaceCampaign } from 'src/ai/ai.service'
import { Roles } from 'src/authentication/decorators/Roles.decorator'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { EVENTS } from '../../../vendors/segment/segment.types'

@Controller('campaigns/ai')
@UseCampaign()
@UsePipes(ZodValidationPipe)
export class AiContentController {
  private readonly logger = new Logger(AiContentController.name)

  constructor(
    private readonly aiContent: AiContentService,
    private readonly ai: AiService,
    private readonly campaigns: CampaignsService,
    private readonly content: ContentService,
    private readonly analytics: AnalyticsService,
  ) {}

  @Post()
  async create(
    @Res({ passthrough: true }) res: FastifyReply,
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
    @Body() body: CreateAiContentSchema,
  ) {
    try {
      const result = await this.aiContent.createContent(campaign, body)

      this.analytics.track(user.id, EVENTS.AiContent.GenerationStarted, {
        slug: campaign.slug,
        key: body.key,
        regenerate: body.regenerate,
      })

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

  @Put('rename')
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

    return this.campaigns.update({
      where: { id: campaign.id },
      data: { aiContent },
    })
  }

  @Delete(':key')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@ReqCampaign() campaign: Campaign, @Param('key') key: string) {
    const aiContent = campaign.aiContent

    if (!aiContent?.[key]) {
      // nothing to delete
      throw new NotFoundException('Content not found')
    }

    delete aiContent[key]
    delete aiContent.generationStatus?.[key]

    return this.campaigns.update({
      where: { id: campaign.id },
      data: { aiContent },
    })
  }

  @Get('system-prompt')
  @Roles(UserRole.admin)
  async systemPrompt(
    @Query() { slug, initial = false }: GetSystemPromptSchema,
  ) {
    const campaign = (await this.campaigns.findFirst({
      where: { slug },
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
    })) as PromptReplaceCampaign

    if (!campaign) {
      throw new BadRequestException('No campaign found')
    }

    const { candidateJson, systemPrompt } =
      await this.content.getChatSystemPrompt(initial)

    const candidateContext = await this.ai.promptReplace(
      candidateJson,
      campaign,
    )

    if (!candidateContext || !systemPrompt) {
      throw new NotFoundException('No system prompt')
    }

    return {
      candidateContext,
      systemPrompt,
    }
  }
}
