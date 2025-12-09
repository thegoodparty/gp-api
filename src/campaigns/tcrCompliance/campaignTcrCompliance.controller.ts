import {
  BadGatewayException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  InternalServerErrorException,
  NotFoundException,
  Param,
  Post,
  UsePipes,
} from '@nestjs/common'
import { CampaignTcrComplianceService } from './services/campaignTcrCompliance.service'
import { CreateTcrComplianceDto } from './schemas/createTcrComplianceDto.schema'
import { UseCampaign } from '../decorators/UseCampaign.decorator'
import { ReqCampaign } from '../decorators/ReqCampaign.decorator'
import { Campaign, TcrComplianceStatus, User } from '@prisma/client'
import { UsersService } from '../../users/services/users.service'
import { ZodValidationPipe } from 'nestjs-zod'
import { CampaignsService } from '../services/campaigns.service'
import { submitCampaignVerifyPinDto } from './schemas/submitCampaignVerifyPinDto.schema'
import { ReqUser } from '../../authentication/decorators/ReqUser.decorator'

@Controller('campaigns/tcr-compliance')
@UsePipes(ZodValidationPipe)
export class CampaignTcrComplianceController {
  constructor(
    private readonly userService: UsersService,
    private readonly tcrComplianceService: CampaignTcrComplianceService,
    private readonly campaignsService: CampaignsService,
  ) {}

  @Get('mine')
  @UseCampaign()
  async getMyTcrCompliance(@ReqCampaign() campaign: Campaign) {
    const tcrCompliance = await this.tcrComplianceService.fetchByCampaignId(
      campaign.id,
    )
    if (!tcrCompliance) {
      throw new NotFoundException(
        'TCR compliance does not exist for this campaign',
      )
    }
    return tcrCompliance
  }

  /**
   * Creates a new TCR Compliance record or resumes an incomplete Peerly registration flow.
   *
   * If a TcrCompliance record already exists for this campaign but the Peerly
   * registration flow is incomplete (e.g., a previous submission failed mid-way),
   * this endpoint will resume the flow from where it left off.
   */
  @Post()
  @UseCampaign()
  async createTcrCompliance(
    @ReqCampaign() campaign: Campaign,
    @Body()
    tcrComplianceDto: CreateTcrComplianceDto,
  ) {
    const existingTcrCompliance =
      await this.tcrComplianceService.fetchByCampaignId(campaign.id)

    // If a completed TcrCompliance record exists (has peerlyIdentityId and is not in error state),
    // don't allow re-creation. The user should proceed to the PIN step instead.
    if (
      existingTcrCompliance?.peerlyIdentityId &&
      existingTcrCompliance?.status !== TcrComplianceStatus.error
    ) {
      throw new ConflictException(
        'TCR compliance already exists for this campaign. Please proceed to the PIN verification step.',
      )
    }

    const { placeId, formattedAddress, ...tcrComplianceCreatePayload } =
      tcrComplianceDto
    const { ein, committeeName } = tcrComplianceCreatePayload
    const user = await this.userService.findByCampaign(campaign)
    const updatedCampaign = await this.campaignsService.updateJsonFields(
      campaign.id,
      {
        details: {
          einNumber: ein,
          campaignCommittee: committeeName,
        },
        placeId,
        formattedAddress,
      },
    )

    if (!updatedCampaign) {
      throw new InternalServerErrorException(
        'Failed to update campaign details',
      )
    }

    // The create method now handles both fresh creation and resumption
    return this.tcrComplianceService.create(
      user!,
      updatedCampaign,
      tcrComplianceCreatePayload,
    )
  }

  private readonly retrieveTcrCompliance = async (
    tcrComplianceId: string,
    campaign: Campaign,
  ) => {
    const tcrCompliance = await this.tcrComplianceService.fetchByCampaignId(
      campaign.id,
    )
    if (!tcrCompliance) {
      throw new NotFoundException(
        'TCR compliance does not exist for this campaign',
      )
    }
    if (tcrCompliance.id !== tcrComplianceId) {
      throw new ForbiddenException(
        'TCR compliance ID does not match the campaign ID',
      )
    }
    return tcrCompliance
  }

  @Post(':id/submit-cv-pin')
  @UseCampaign()
  @HttpCode(HttpStatus.OK)
  async submitCampaignVerifyPIN(
    @Param('id') tcrComplianceId: string,
    @Body() { pin }: submitCampaignVerifyPinDto,
    @ReqUser() user: User,
    @ReqCampaign() campaign: Campaign,
  ) {
    const tcrCompliance = await this.retrieveTcrCompliance(
      tcrComplianceId,
      campaign,
    )

    const campaignVerifyToken =
      await this.tcrComplianceService.retrieveCampaignVerifyToken(
        pin,
        tcrCompliance,
      )

    if (!campaignVerifyToken) {
      throw new BadGatewayException(
        'Campaign verify token could not be retrieved',
      )
    }

    const campaignVerifyBrand =
      await this.tcrComplianceService.submitCampaignVerifyToken(
        user,
        tcrCompliance,
        campaignVerifyToken,
      )

    await this.tcrComplianceService.model.update({
      where: { id: tcrCompliance.id },
      data: {
        status: TcrComplianceStatus.pending,
      },
    })

    return campaignVerifyBrand
  }

  @Get(':id/status')
  @UseCampaign()
  async getTcrComplianceStatus(
    @Param('id') tcrComplianceId: string,
    @ReqCampaign() campaign: Campaign,
  ) {
    const { peerlyIdentityId } = await this.retrieveTcrCompliance(
      tcrComplianceId,
      campaign,
    )
    return {
      status: !peerlyIdentityId
        ? false
        : await this.tcrComplianceService.checkTcrRegistrationStatus(
            peerlyIdentityId!,
          ),
    }
  }

  @Delete(':id')
  @UseCampaign()
  async deleteTcrCompliance(
    @Param('id') tcrComplianceId: string,
    @ReqCampaign() campaign: Campaign,
  ) {
    const tcrCompliance = await this.retrieveTcrCompliance(
      tcrComplianceId,
      campaign,
    )
    return this.tcrComplianceService.delete(tcrCompliance.id)
  }
}
