import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common'
import { CampaignsService } from './campaigns.service'
import {
  UpdateCampaignBody,
  updateCampaignSchema,
} from './schemas/updateCampaign.schema'
import {
  createCampaignSchema,
  CreateCampaignBody,
} from './schemas/createCampaign.schema'
import {
  campaignListSchema,
  CampaignListQuery,
} from './schemas/campaignList.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(
    @Query(new ZodValidationPipe(campaignListSchema)) query: CampaignListQuery,
  ) {
    return this.campaignsService.findAll(query)
  }

  // @Get('mine')
  // async findUserCampaign() {
  // TODO: query campaign for current user
  // }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const campaign = await this.campaignsService.findOne({ id })

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Get('slug/:slug')
  async findBySlug(@Param('slug') slug: string) {
    const campaign = await this.campaignsService.findOne({ slug })

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Post()
  async create(
    @Body(new ZodValidationPipe(createCampaignSchema)) body: CreateCampaignBody,
  ) {
    try {
      const campaign = await this.campaignsService.create(body)
      return { slug: campaign.slug }
    } catch (e) {
      if (e instanceof PrismaClientKnownRequestError) {
        if (e.code === 'P2002') {
          throw new BadRequestException(
            'A new campaign cannot be created with this slug',
            { cause: e },
          )
        }
      }

      throw e
    }
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(updateCampaignSchema))
    body: UpdateCampaignBody,
  ) {
    // TODO get campaign from req user
    const updateResp = await this.campaignsService.update(id, body)

    if (updateResp === false) throw new NotFoundException()
    return updateResp
  }
}
