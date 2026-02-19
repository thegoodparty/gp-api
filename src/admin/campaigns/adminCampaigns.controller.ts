import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common'
import { AdminCampaignsService } from './adminCampaigns.service'
import { AdminCreateCampaignSchema } from './schemas/adminCreateCampaign.schema'
import { ZodValidationPipe } from 'nestjs-zod'
import { AdminUpdateCampaignSchema } from './schemas/adminUpdateCampaign.schema'
import { Roles } from '../../authentication/decorators/Roles.decorator'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { User, UserRole } from '@prisma/client'
import { ReqUser } from '../../authentication/decorators/ReqUser.decorator'
import { SlackService } from '../../vendors/slack/services/slack.service'
import { SlackChannel } from '../../vendors/slack/slackService.types'

@Controller('admin/campaigns')
@Roles(UserRole.admin)
@UsePipes(ZodValidationPipe)
export class AdminCampaignsController {
  constructor(
    private readonly adminCampaigns: AdminCampaignsService,
    private readonly campaigns: CampaignsService,
    private readonly slack: SlackService,
  ) {}

  @Post()
  @Roles(UserRole.admin, UserRole.sales)
  create(@Body() body: AdminCreateCampaignSchema) {
    return this.adminCampaigns.create(body)
  }

  @Put(':id')
  @Roles(UserRole.admin, UserRole.sales)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: AdminUpdateCampaignSchema,
  ) {
    return this.adminCampaigns.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id', ParseIntPipe) id: number, @ReqUser() user: User) {
    const campaign = await this.campaigns.findUniqueOrThrow({
      where: { id },
    })
    // Logging the deletion to Slack to track why campaigns are deleted:
    //  https://goodparty.atlassian.net/browse/WEB-4324
    await this.slack.message(
      {
        body: `Admin ${user.email} deleted campaign with ID ${id} related to userId: ${campaign.userId}`,
      },
      SlackChannel.botDeletions,
    )
    return this.campaigns.delete({ where: { id } })
  }

  @Post(':id/send-victory-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  async sendVictoryEmail(@Param('id', ParseIntPipe) id: number) {
    await this.adminCampaigns.sendVictoryEmail(id)
  }

  @Get('pro-no-voter-file')
  proCampaignsWithNoVoterFile() {
    return this.adminCampaigns.proNoVoterFile()
  }

  @Get('p2v-stats')
  p2vStats() {
    return this.adminCampaigns.p2vStats()
  }
}
