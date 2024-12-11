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
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { CampaignsService } from './campaigns.service'
import { UpdateCampaignSchema } from './schemas/updateCampaign.schema'
import { CreateCampaignSchema } from './schemas/createCampaign.schema'
import { CampaignListSchema } from './schemas/campaignList.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { ReqUser } from '../authentication/decorators/req-user.decorator'
import { User } from '@prisma/client'
import { CampaignOwnersOrAdminGuard } from './guards/campaign-owners-or-admin.guard'
import { Roles } from '../authentication/decorators/roles.decorator'

@Controller('campaigns')
@UsePipes(ZodValidationPipe)
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Roles('admin')
  @Get()
  findAll(@Query() query: CampaignListSchema) {
    return this.campaignsService.findAll(query)
  }

  // @Get('mine')
  // async findUserCampaign() {
  // TODO: query campaign for current user
  // }

  @UseGuards(CampaignOwnersOrAdminGuard)
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const campaign = await this.campaignsService.findOne({ id })

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Get('slug/:slug')
  @Roles('admin')
  async findBySlug(@Param('slug') slug: string) {
    const campaign = await this.campaignsService.findOne({ slug })

    if (!campaign) throw new NotFoundException()

    return campaign
  }

  @Post()
  async create(
    @ReqUser() user: User,
    @Body() campaignData: CreateCampaignSchema,
  ) {
    try {
      const campaign = await this.campaignsService.create(campaignData, user)
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
  @UseGuards(CampaignOwnersOrAdminGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateCampaignSchema,
  ) {
    // TODO get campaign from req user
    const updateResp = await this.campaignsService.update(id, body)

    if (updateResp === false) throw new NotFoundException()
    return updateResp
  }
}
