import {
  Controller,
  UsePipes,
  Get,
  Post,
  Delete,
  Query,
  ForbiddenException,
  Param,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Body,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { CampaignsService } from '../services/campaigns.service'
import { Campaign, User } from '@prisma/client'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { getUserFullName, isAdmin } from 'src/users/util/users.util'
import { CampaignUpdateHistoryService } from './campaignUpdateHistory.service'
import { CreateUpdateHistorySchema } from './schemas/createUpdateHistory.schema'
import { ReqCampaign } from '../decorators/ReqCampaign.decorator'
import { UseCampaign } from '../decorators/UseCampaign.decorator'

@Controller('campaigns/mine/update-history')
@UsePipes(ZodValidationPipe)
export class CampaignUpdateHistoryController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly updateHistory: CampaignUpdateHistoryService,
  ) {}

  @Get()
  async list(@ReqUser() user: User, @Query('slug') slug?: string) {
    if (typeof slug === 'string' && !isAdmin(user)) {
      throw new ForbiddenException()
    }

    const campaign = slug
      ? await this.campaigns.findFirstOrThrow({ where: { slug } })
      : await this.campaigns.findByUser(user.id)

    const updateHistory = await this.updateHistory.findMany({
      where: {
        campaignId: campaign.id,
      },
      include: {
        user: {
          select: {
            firstName: true,
            lastName: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    return updateHistory.map((update) => ({
      ...update,
      user: {
        name: getUserFullName(user),
        avatar: update?.user?.avatar,
      },
    }))
  }

  @Post()
  @UseCampaign()
  create(
    @ReqCampaign() campaign: Campaign,
    @Body() body: CreateUpdateHistorySchema,
  ) {
    return this.updateHistory.create(campaign, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.updateHistory.delete(id)
  }
}
