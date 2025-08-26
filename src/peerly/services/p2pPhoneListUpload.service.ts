import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { VoterDatabaseService } from '../../voters/services/voterDatabase.service'
import { PeerlyPhoneListService } from './peerlyPhoneList.service'
import { CampaignTcrComplianceService } from '../../campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { P2pPhoneListRequestSchema } from '../schemas/p2pPhoneListRequest.schema'
import { VoterFileType } from '../../voters/voterFile/voterFile.types'
import {
  CustomFilter,
  CHANNELS,
  PURPOSES,
} from '../../shared/types/voter.types'
import { typeToQuery } from '../../voters/voterFile/util/voterFile.util'
import {
  mapAudienceFieldsToCustomFilters,
  P2P_CSV_COLUMN_MAPPINGS,
} from '../utils/audienceMapping.util'
import { Readable } from 'stream'

@Injectable()
export class P2pPhoneListUploadService {
  private readonly logger = new Logger(P2pPhoneListUploadService.name)

  constructor(
    private readonly voterDatabaseService: VoterDatabaseService,
    private readonly peerlyPhoneListService: PeerlyPhoneListService,
    private readonly tcrComplianceService: CampaignTcrComplianceService,
  ) {}

  async uploadPhoneList(
    campaign: Campaign,
    request: P2pPhoneListRequestSchema,
  ): Promise<{ token: string; listName: string }> {
    const { name: listName, ...filterData } = request

    const tcrCompliance = await this.tcrComplianceService.fetchByCampaignId(
      campaign.id,
    )

    if (!tcrCompliance || !tcrCompliance.peerlyIdentityId) {
      throw new BadRequestException(
        'TCR compliance record does not have a Peerly identity ID',
      )
    }

    const filters = this.transformRequestToFilters(filterData)

    let csvStream: Readable
    try {
      csvStream = await this.generatePhoneListCsvStream(campaign, filters)
    } catch (error) {
      this.logger.error(
        `Failed to generate CSV stream for campaign ${campaign.id}:`,
        error,
      )
      throw new BadRequestException(
        'Failed to generate voter data for phone list',
      )
    }

    let token: string
    try {
      token = await this.peerlyPhoneListService.uploadPhoneListToken({
        listName,
        csvStream,
        identityId: tcrCompliance.peerlyIdentityId,
      })
    } catch (error) {
      this.logger.error(
        `Failed to upload phone list to Peerly for campaign ${campaign.id}:`,
        error,
      )
      throw new BadRequestException(
        'Failed to upload phone list to Peerly platform',
      )
    }

    this.logger.debug(
      `P2P phone list uploaded successfully for campaign ${campaign.id}, token: ${token}`,
    )

    return { token, listName }
  }

  private transformRequestToFilters(
    filterData: Omit<P2pPhoneListRequestSchema, 'name'>,
  ): CustomFilter[] {
    return mapAudienceFieldsToCustomFilters(filterData)
  }

  private async generatePhoneListCsvStream(
    campaign: Campaign,
    filters: CustomFilter[],
  ): Promise<Readable> {
    const customFilters = {
      filters,
      channel: CHANNELS.TEXTING,
      purpose: PURPOSES.GOTV,
    }

    const query = typeToQuery(
      VoterFileType.sms,
      { ...campaign, pathToVictory: null },
      customFilters,
      false, // not count only
      false, // not fix columns
      P2P_CSV_COLUMN_MAPPINGS,
    )

    this.logger.debug('Generated P2P phone list query:', query)

    const streamableFile = await this.voterDatabaseService.csvStream(
      query,
      'phone-list',
      P2P_CSV_COLUMN_MAPPINGS,
    )

    const stream = streamableFile.getStream()
    if (!(stream instanceof Readable)) {
      throw new Error(
        'Expected Readable stream from csvStream but received different type',
      )
    }

    return stream
  }
}
