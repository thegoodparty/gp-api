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
  UsePipes,
  ValidationPipe,
} from '@nestjs/common'
import { CampaignsService } from './campaigns.service'
import { UpdateCampaignDto } from './dto/updateCampaign.dto'
import { CreateCampaignDto } from './dto/createCampaign.dto'
import { CampaignListDto } from './dto/campaignList.dto'
import { Prisma } from '@prisma/client'

@Controller('campaigns')
@UsePipes(
  new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }),
)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  findAll(@Query() query: CampaignListDto) {
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
  async create(@Body() createCampaignDto: CreateCampaignDto) {
    try {
      const campaign = await this.campaignsService.create(createCampaignDto)
      return { slug: campaign.slug }
    } catch (e) {
      if (e.code === 'P2002') {
        throw new BadRequestException(
          'A new campaign cannot be created with this slug',
          { cause: e },
        )
      }

      throw e
    }
  }

  @Put(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCampaignDto: UpdateCampaignDto,
  ) {
    // TODO get campaign from req user
    const updateResp = await this.campaignsService.update(id, updateCampaignDto)

    if (updateResp === false) throw new NotFoundException()
    return updateResp
  }
}
