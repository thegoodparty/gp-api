import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { VoterFileFilterService } from '../../voters/services/voterFileFilter.service'
import { VoterDatabaseService } from '../../voters/services/voterDatabase.service'
import { PeerlyPhoneListService } from './peerlyPhoneList.service'
import { CampaignTcrComplianceService } from '../../campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { P2pPhoneListRequestSchema } from '../schemas/p2pPhoneListRequest.schema'
import {
  VoterFileType,
  CustomFilter,
} from '../../voters/voterFile/voterFile.types'
import { typeToQuery } from '../../voters/voterFile/util/voterFile.util'
import { Readable } from 'stream'
import { to as copyTo } from 'pg-copy-streams'

@Injectable()
export class P2pPhoneListUploadService {
  private readonly logger = new Logger(P2pPhoneListUploadService.name)

  constructor(
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly voterDatabaseService: VoterDatabaseService,
    private readonly peerlyPhoneListService: PeerlyPhoneListService,
    private readonly tcrComplianceService: CampaignTcrComplianceService,
  ) {}

  async uploadPhoneList(
    campaign: Campaign,
    request: P2pPhoneListRequestSchema,
  ): Promise<{ token: string; listName: string }> {
    const { listName, ...filterData } = request

    // Get TCR compliance record for identity_id
    const tcrCompliance = await this.tcrComplianceService.fetchByCampaignId(
      campaign.id,
    )

    if (!tcrCompliance || !tcrCompliance.peerlyIdentityId) {
      throw new BadRequestException(
        'TCR compliance record does not have a Peerly identity ID',
      )
    }

    // Create a temporary voter file filter to generate the audience data
    const tempFilterName = `P2P_${listName}_${Date.now()}`
    const voterFileFilter = await this.voterFileFilterService.create(
      campaign.id,
      {
        name: tempFilterName,
        ...filterData,
      },
    )

    try {
      // Convert voter file filter to audience format for CSV generation
      const audienceData =
        await this.voterFileFilterService.voterFileFilterToAudience(
          voterFileFilter,
        )

      // Convert audience data to filters array
      const filters: CustomFilter[] = Object.entries(audienceData)
        .filter(([_key, value]) => value === true)
        .map(([key, _value]) => key as CustomFilter)

      // Generate CSV stream with voter data including phone numbers
      const csvStream = await this.generatePhoneListCsvStream(campaign, filters)

      // Upload to Peerly
      const token = await this.peerlyPhoneListService.uploadPhoneListToken({
        listName,
        csvStream,
        identityId: tcrCompliance.peerlyIdentityId,
      })

      this.logger.debug(
        `P2P phone list uploaded successfully for campaign ${campaign.id}, token: ${token}`,
      )

      return { token, listName }
    } finally {
      // Clean up temporary voter file filter
      await this.voterFileFilterService.delete(voterFileFilter.id)
    }
  }

  private async generatePhoneListCsvStream(
    campaign: Campaign,
    filters: CustomFilter[],
  ): Promise<Readable> {
    const customFilters = {
      filters,
      channel: 'Phone Banking' as const, // Use Phone Banking channel for P2P
      purpose: 'GOTV' as const, // Default purpose
    }

    // Generate SQL query for the voter data
    const query = typeToQuery(
      VoterFileType.telemarketing, // Use telemarketing type for phone numbers
      { ...campaign, pathToVictory: null },
      customFilters,
      false, // not count only
      false, // not fix columns
      [
        { db: 'first_name', label: 'first_name' },
        { db: 'last_name', label: 'last_name' },
        { db: 'phone', label: 'lead_phone' },
        { db: 'state', label: 'state' },
        { db: 'city', label: 'city' },
        { db: 'zip', label: 'zip' },
      ],
    )

    this.logger.debug('Generated P2P phone list query:', query)

    // Create a raw CSV stream without StreamableFile wrapper
    const client = await this.voterDatabaseService['pool'].connect()

    const csvStream = client
      .query(copyTo(`COPY(${query}) TO STDOUT WITH CSV HEADER`))
      .on('error', (err: Error) => {
        this.logger.error('Error in CSV stream:', err)
        client.release()
        throw err
      })
      .on('end', () => {
        client.release()
      })

    return csvStream
  }
}
