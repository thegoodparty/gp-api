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
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'

@Controller('campaigns/mine/update-history')
@UsePipes(ZodValidationPipe)
export class CampaignUpdateHistoryController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly updateHistory: CampaignUpdateHistoryService,
    private readonly clerkEnricher: ClerkUserEnricherService,
  ) {}

  @Get()
  async list(@ReqUser() user: User, @Query('slug') slug?: string) {
    if (typeof slug === 'string' && !isAdmin(user)) {
      throw new ForbiddenException()
    }

    const campaign = slug
      ? await this.campaigns.findFirstOrThrow({ where: { slug } })
      : await this.campaigns.findByUserId(user.id)

    const updateHistory = await this.updateHistory.findMany({
      where: {
        campaignId: campaign.id,
      },
      include: {
        user: {
          select: {
            clerkId: true,
            firstName: true,
            lastName: true,
            name: true,
            avatar: true,
          },
        },
      },
    })

    const users = updateHistory
      .map((u) => u.user)
      .filter((u): u is NonNullable<typeof u> => u != null)
    const enriched = await this.clerkEnricher.enrichUsers(users)
    let idx = 0
    for (const update of updateHistory) {
      if (update.user) {
        update.user = enriched[idx++]
      }
    }

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
