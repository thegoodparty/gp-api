import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import {
  VoterDatabaseService
} from '../../voters/services/voterDatabase.service'
import { PeerlyPhoneListService } from './peerlyPhoneList.service'
import {
  CampaignTcrComplianceService
} from '../../campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import {
  P2pPhoneListRequestSchema
} from '../schemas/p2pPhoneListRequest.schema'
import { VoterFileType } from '../../voters/voterFile/voterFile.types'
import {
  CHANNELS,
  CustomFilter,
  PURPOSES,
} from '../../shared/types/voter.types'
import { typeToQuery } from '../../voters/voterFile/util/voterFile.util'
import {
  mapAudienceFieldsToCustomFilters,
  P2P_CSV_COLUMN_MAPPINGS,
} from '../utils/audienceMapping.util'
import { Readable } from 'stream'
import { CampaignWith } from '../../campaigns/campaigns.types'

@Injectable()
export class P2pPhoneListUploadService {
  private readonly logger = new Logger(P2pPhoneListUploadService.name)

  constructor(
    private readonly voterDatabaseService: VoterDatabaseService,
    private readonly peerlyPhoneListService: PeerlyPhoneListService,
    private readonly tcrComplianceService: CampaignTcrComplianceService,
  ) {}

  async uploadPhoneList(
    campaign: CampaignWith<'pathToVictory'>,
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

    let csvBuffer: Buffer
    try {
      csvBuffer = await this.generatePhoneListCsvStream(campaign, filters)
    } catch (error) {
      this.logger.error(
        `Failed to generate CSV buffer for campaign ${campaign.id}:`,
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
        csvBuffer,
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
    campaign: CampaignWith<'pathToVictory'>,
    filters: CustomFilter[],
  ): Promise<Buffer> {
    const customFilters = {
      filters,
      channel: CHANNELS.TEXTING,
      purpose: PURPOSES.GOTV,
    }

    const query = typeToQuery(
      VoterFileType.sms,
      campaign,
      customFilters,
      false, // not count only
      false, // not fix columns
      P2P_CSV_COLUMN_MAPPINGS,
    )

    this.logger.debug('Generated P2P phone list query:', query)

    const stream = await this.voterDatabaseService.csvReadableStream(
      query,
      P2P_CSV_COLUMN_MAPPINGS,
    )

    if (!(stream instanceof Readable)) {
      throw new Error(
        'Expected Readable stream from csvReadableStream but received different type',
      )
    }

    // Collect the stream data into a buffer to ensure FormData can consume it properly
    const chunks: Buffer[] = []

    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk))
      })

      stream.on('end', () => {
        const csvData = Buffer.concat(chunks)
        this.logger.debug(`Collected ${csvData.length} bytes of CSV data`)

        // Return the buffer directly instead of creating a stream
        resolve(csvData)
      })

      stream.on('error', (error) => {
        this.logger.error('Error collecting CSV stream data:', error)
        reject(error)
      })
    })
  }
}
