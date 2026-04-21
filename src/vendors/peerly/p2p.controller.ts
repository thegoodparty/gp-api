import {
  BadGatewayException,
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Res,
  UsePipes,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { FastifyReply } from 'fastify'
import { Campaign } from '@prisma/client'
import { ReqCampaign } from '../../campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '../../campaigns/decorators/UseCampaign.decorator'
import { OrganizationsService } from '../../organizations/services/organizations.service'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'
import { PhoneListState } from './peerly.types'
import {
  CheckPhoneListStatusAcceptedResponseDto,
  CheckPhoneListStatusResponseDto,
} from './schemas/p2pPhoneListStatus.schema'
import { P2pPhoneListRequestSchema } from './schemas/p2pPhoneListRequest.schema'
import { P2pPhoneListResponseSchema } from './schemas/p2pPhoneListResponse.schema'
import { P2pPhoneListUploadService } from './services/p2pPhoneListUpload.service'
import { PinoLogger } from 'nestjs-pino'

@Controller('p2p')
@UsePipes(ZodValidationPipe)
export class P2pController {
  constructor(
    private readonly peerlyPhoneListService: PeerlyPhoneListService,
    private readonly p2pPhoneListUploadService: P2pPhoneListUploadService,
    private readonly organizationsService: OrganizationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(P2pController.name)
  }

  @Get('phone-list/:token/status')
  @UseCampaign()
  async checkPhoneListStatus(
    @Param('token') token: string,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<
    CheckPhoneListStatusResponseDto | CheckPhoneListStatusAcceptedResponseDto
  > {
    try {
      const statusResponse =
        await this.peerlyPhoneListService.checkPhoneListStatus(token)

      if (!statusResponse) {
        res.status(HttpStatus.ACCEPTED)
        return {
          message: 'Phone list status is not yet available. Please try again.',
        }
      }

      if (statusResponse.Data.list_state !== PhoneListState.ACTIVE) {
        const status = statusResponse.Data.list_state || 'unknown'
        res.status(HttpStatus.ACCEPTED)
        return {
          message:
            status === PhoneListState.PROCESSING
              ? 'Phone list is still processing. Please try again in a few moments.'
              : `Phone list is not ready. Current status: ${status}`,
        }
      }

      const listId = statusResponse.Data.list_id
      if (!listId) {
        throw new BadGatewayException(
          'Phone list is active but no list_id was returned',
        )
      }

      const detailsResponse =
        await this.peerlyPhoneListService.getPhoneListDetails(listId)

      return {
        phoneListId: listId,
        leadsLoaded: detailsResponse.leads_loaded,
      }
    } catch (error) {
      if (error instanceof BadGatewayException) {
        throw error
      }

      this.logger.error({ error }, 'Failed to check phone list status')
      throw new BadGatewayException('Failed to check phone list status.')
    }
  }

  @Post('phone-list')
  @UseCampaign()
  async uploadPhoneList(
    @ReqCampaign() campaign: Campaign,
    @Body() request: P2pPhoneListRequestSchema,
  ): Promise<P2pPhoneListResponseSchema> {
    try {
      const district = campaign.organizationSlug
        ? await this.organizationsService.getDistrictForOrgSlug(
            campaign.organizationSlug,
          )
        : null
      const { token } = await this.p2pPhoneListUploadService.uploadPhoneList(
        campaign,
        request,
        district,
      )

      return { token }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      this.logger.error({ error }, 'Failed to upload phone list')
      throw new BadGatewayException('Failed to upload phone list.')
    }
  }
}
