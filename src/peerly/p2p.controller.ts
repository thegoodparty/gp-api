import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UsePipes,
} from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqCampaign } from '../campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from '../campaigns/decorators/UseCampaign.decorator'
import { PeerlyPhoneListService } from './services/peerlyPhoneList.service'
import {
  CheckPhoneListStatusRequestDto,
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

  @Post('phone-list-status')
  @HttpCode(HttpStatus.OK)
  @UseCampaign()
  async checkPhoneListStatus(
    @ReqCampaign() campaign: Campaign,
    @Body() body: CheckPhoneListStatusRequestDto,
  ): Promise<
    | CheckPhoneListStatusSuccessResponseDto
    | CheckPhoneListStatusFailureResponseDto
  > {
    const { token } = body

    try {
      // First, check the phone list status
      const statusResponse =
        await this.peerlyPhoneListService.checkPhoneListStatus(token)

      // Check if the list state is ACTIVE
      if (statusResponse.Data.list_state !== 'ACTIVE') {
        return {
          success: false,
          message: `Phone list is not ready. Current status: ${statusResponse.Data.list_state || 'unknown'}`,
        }
      }

      // If ACTIVE, get the list_id and fetch details
      const listId = statusResponse.Data.list_id
      if (!listId) {
        return {
          success: false,
          message: 'Phone list is active but no list_id was returned',
        }
      }

      // Get phone list details
      const detailsResponse =
        await this.peerlyPhoneListService.getPhoneListDetails(listId)

      return {
        success: true,
        phone_list_id: listId,
        leads_loaded: detailsResponse.leads_loaded,
      }
    } catch (error) {
      this.logger.error('Failed to check phone list status', error)
      return {
        success: false,
        message: 'Failed to check phone list status. Please try again later.',
      }
    }
  }
}
