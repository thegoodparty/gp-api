import {
  BadGatewayException,
  Controller,
  Get,
  Logger,
  Param,
  UsePipes,
} from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from '../campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '../campaigns/decorators/UseCampaign.decorator'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'
import { PhoneListState } from './peerly.types'
import {
  CheckPhoneListStatusSuccessResponseDto,
  CheckPhoneListStatusFailureResponseDto,
} from './schemas/p2pPhoneListStatus.schema'

@Controller('p2p')
@UsePipes(ZodValidationPipe)
export class P2pController {
  private readonly logger = new Logger(P2pController.name)

  constructor(
    private readonly peerlyPhoneListService: PeerlyPhoneListService,
  ) {}

  @Get('phone-list/:token/status')
  @UseCampaign()
  async checkPhoneListStatus(
    @ReqCampaign() campaign: Campaign,
    @Param('token') token: string,
  ): Promise<
    | CheckPhoneListStatusSuccessResponseDto
    | CheckPhoneListStatusFailureResponseDto
  > {
    try {
      const statusResponse =
        await this.peerlyPhoneListService.checkPhoneListStatus(token)

      if (statusResponse.Data.list_state !== PhoneListState.ACTIVE) {
        return {
          success: false,
          message: `Phone list is not ready. Current status: ${statusResponse.Data.list_state || 'unknown'}`,
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
        success: true,
        phoneListId: listId,
        leadsLoaded: detailsResponse.leads_loaded,
      }
    } catch (error) {
      this.logger.error('Failed to check phone list status', error)
      throw new BadGatewayException(
        'Failed to check phone list status due to request failure.',
      )
    }
  }
}
