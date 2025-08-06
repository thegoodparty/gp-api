import { Injectable, Logger } from '@nestjs/common'
import { PhoneListService } from './phoneList.service'
import { MediaService } from './media.service'
import { P2pSmsService } from './p2pSms.service'
import { PollingUtil } from '../utils/polling.util'
import { VoterFileService } from '../../voters/voterFile/voterFile.service'
import { CampaignWith } from '../../campaigns/campaigns.types'
import { VoterFileType } from '../../voters/voterFile/voterFile.types'
import { Readable } from 'stream'
import { StreamableFile } from '@nestjs/common'

// Polling Configuration Constants
const POLLING_MAX_ATTEMPTS = parseInt(
  process.env.PEERLY_POLLING_MAX_ATTEMPTS || '60',
  10,
)
const POLLING_INITIAL_DELAY_MS = parseInt(
  process.env.PEERLY_POLLING_INITIAL_DELAY_MS || '5000',
  10,
)
const POLLING_MAX_DELAY_MS = parseInt(
  process.env.PEERLY_POLLING_MAX_DELAY_MS || '30000',
  10,
)
const POLLING_BACKOFF_MULTIPLIER = parseFloat(
  process.env.PEERLY_POLLING_BACKOFF_MULTIPLIER || '1.5',
)

interface CreateP2pCampaignParams {
  campaign: CampaignWith<'pathToVictory'>
  jobName: string
  messageTemplates: Array<{
    title: string
    text: string
    mediaStream?: {
      stream: Readable
      fileName: string
      mimeType: string
      fileSize?: number
    }
  }>
  didState: string
  identityId?: string
  voterFileParams: {
    type: VoterFileType
    customFilters?: any
    selectedColumns?: Array<{ db: string; label?: string }>
    limit?: number
  }
}

interface P2pCampaignResult {
  jobId: string
  listId: number
  mediaIds: string[]
}

@Injectable()
export class P2pWorkflowService {
  private readonly logger = new Logger(P2pWorkflowService.name)

  constructor(
    private readonly phoneListService: PhoneListService,
    private readonly mediaService: MediaService,
    private readonly p2pSmsService: P2pSmsService,
    private readonly voterFileService: VoterFileService,
  ) {}

  async createP2pCampaign(
    params: CreateP2pCampaignParams,
  ): Promise<P2pCampaignResult> {
    const {
      campaign,
      jobName,
      messageTemplates,
      didState,
      identityId,
      voterFileParams,
    } = params

    try {
      // Step 1: Upload media files if present
      const mediaIds: string[] = []
      for (const template of messageTemplates) {
        if (template.mediaStream) {
          this.logger.log(`Uploading media for template: ${template.title}`)
          const mediaId = await this.mediaService.createMedia({
            identityId: identityId || campaign.id.toString(),
            fileStream: template.mediaStream.stream,
            fileName: template.mediaStream.fileName,
            mimeType: template.mediaStream.mimeType,
            fileSize: template.mediaStream.fileSize,
          })
          mediaIds.push(mediaId)
        }
      }

      // Step 2: Generate and upload phone list
      this.logger.log('Generating voter CSV...')
      const csvResult = await this.voterFileService.getCsvOrCount(campaign, {
        ...voterFileParams,
        countOnly: false,
      })

      // Extract the stream from StreamableFile
      let csvStream: Readable
      if (csvResult instanceof StreamableFile) {
        csvStream = csvResult.getStream() as Readable
      } else {
        throw new Error('Expected StreamableFile from voter file service')
      }

      this.logger.log('Uploading phone list...')
      const listToken = await this.phoneListService.uploadPhoneList({
        listName: `${jobName} - ${new Date().toISOString()}`,
        csvStream,
        identityId,
      })

      // Step 3: Poll for list completion
      this.logger.log('Waiting for phone list processing...')
      const listStatus = await PollingUtil.pollWithBackoff(
        () => this.phoneListService.checkPhoneListStatus(listToken),
        (status) => status.list_status === 'ACTIVE' && !!status.list_id,
        {
          maxAttempts: POLLING_MAX_ATTEMPTS,
          initialDelayMs: POLLING_INITIAL_DELAY_MS,
          maxDelayMs: POLLING_MAX_DELAY_MS,
          backoffMultiplier: POLLING_BACKOFF_MULTIPLIER,
        },
      )

      if (!listStatus.list_id) {
        throw new Error(
          'Phone list processing completed but no list_id returned',
        )
      }

      // Step 4: Create P2P job with templates
      this.logger.log('Creating P2P job...')
      const templates = messageTemplates.map((template, index) => ({
        title: template.title,
        text: template.text,
        ...(mediaIds[index] && {
          advanced: {
            media: {
              media_id: mediaIds[index],
              media_type: template.mediaStream!.mimeType.startsWith('video/')
                ? ('VIDEO' as const)
                : ('IMAGE' as const),
            },
          },
        }),
      }))

      const jobId = await this.p2pSmsService.createJob({
        name: jobName,
        templates,
        didState,
        identityId,
      })

      // Step 5: Assign list to job
      this.logger.log('Assigning phone list to job...')
      await this.p2pSmsService.assignListToJob(jobId, listStatus.list_id)

      this.logger.log(
        `P2P campaign created successfully. Job ID: ${jobId}, List ID: ${listStatus.list_id}`,
      )

      return {
        jobId,
        listId: listStatus.list_id,
        mediaIds,
      }
    } catch (error) {
      this.logger.error('Failed to create P2P campaign:', error)
      throw error
    }
  }
}
