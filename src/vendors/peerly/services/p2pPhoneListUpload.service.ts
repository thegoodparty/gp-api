import { BadRequestException, HttpException, Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'
import { Readable } from 'stream'
import { Campaign } from '@prisma/client'
import { CampaignTcrComplianceService } from '../../../campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { OrgDistrict } from '../../../organizations/organizations.types'
import {
  CHANNELS,
  CustomFilter,
  PURPOSES,
} from '../../../shared/types/voter.types'
import { VoterDatabaseService } from '../../../voters/services/voterDatabase.service'
import { typeToQuery } from '../../../voters/voterFile/util/voterFile.util'
import { VoterFileType } from '../../../voters/voterFile/voterFile.types'
import { P2pPhoneListRequestSchema } from '../schemas/p2pPhoneListRequest.schema'
import {
  mapAudienceFieldsToCustomFilters,
  P2P_CSV_COLUMN_MAPPINGS,
} from '../utils/audienceMapping.util'
import { PeerlyPhoneListService } from './peerlyPhoneList.service'

@Injectable()
export class P2pPhoneListUploadService {
  constructor(
    private readonly voterDatabaseService: VoterDatabaseService,
    private readonly peerlyPhoneListService: PeerlyPhoneListService,
    private readonly tcrComplianceService: CampaignTcrComplianceService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(P2pPhoneListUploadService.name)
  }

  async uploadPhoneList(
    campaign: Campaign,
    request: P2pPhoneListRequestSchema,
    district: OrgDistrict | null,
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
      csvBuffer = await this.generatePhoneListCsvStream(
        campaign,
        district,
        filters,
      )
    } catch (error) {
      this.logger.error(
        { error },
        `Failed to generate CSV buffer for campaign ${campaign.id}:`,
      )
      if (error instanceof HttpException) {
        throw error
      }
      throw new BadRequestException(
        'Failed to generate voter data for phone list',
      )
    }

    let token: string
    try {
      token = await this.peerlyPhoneListService.uploadPhoneList({
        listName,
        csvBuffer,
        identityId: tcrCompliance.peerlyIdentityId,
      })
    } catch (error) {
      this.logger.error(
        { error },
        `Failed to upload phone list to Peerly for campaign ${campaign.id}:`,
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
    district: OrgDistrict | null,
    filters: CustomFilter[],
  ): Promise<Buffer> {
    const customFilters = {
      filters,
      channel: CHANNELS.TEXTING,
      purpose: PURPOSES.GOTV,
    }

    const countQuery = typeToQuery(
      this.logger,
      VoterFileType.sms,
      campaign,
      district,
      customFilters,
      true, // count only
      false,
    )
    let withFixColumns = false
    try {
      const sqlResponse = await this.voterDatabaseService.query<{
        count: string
      }>(countQuery)
      const count = parseInt(String(sqlResponse.rows[0].count))
      withFixColumns = count === 0
      this.logger.debug({ count, withFixColumns }, 'P2P voter count check:')
    } catch (error) {
      if (
        error != null &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === '42703'
      ) {
        // Column does not exist — fall back to fixColumns mode
        withFixColumns = true
        this.logger.debug(
          { withFixColumns },
          'P2P voter count query failed (column not found), falling back to fixColumns:',
        )
      } else {
        throw error
      }
    }

    const query = typeToQuery(
      this.logger,
      VoterFileType.sms,
      campaign,
      district,
      customFilters,
      false, // not count only
      withFixColumns,
      P2P_CSV_COLUMN_MAPPINGS,
    )

    this.logger.debug({ query }, 'Generated P2P phone list query:')

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
      stream.on('data', (chunk: Buffer) => {
        chunks.push(Buffer.from(chunk))
      })

      stream.on('end', () => {
        const csvData = Buffer.concat(chunks)
        this.logger.debug(`Collected ${csvData.length} bytes of CSV data`)

        // Return the buffer directly instead of creating a stream
        resolve(csvData)
      })

      stream.on('error', (error) => {
        this.logger.error(error, 'Error collecting CSV stream data:')
        reject(error)
      })
    })
  }
}
