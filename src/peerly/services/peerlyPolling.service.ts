import { Injectable, Logger } from '@nestjs/common'
import { PeerlyPhoneListService } from './peerlyPhoneList.service'
import { PeerlyMediaService } from './peerlyMedia.service'
import { PeerlyP2pSmsService } from './peerlyP2pSms.service'
import { VoterFileService } from '../../voters/voterFile/voterFile.service'
import { EnqueueService, MessageGroup } from '../../queue/producer/enqueue.service'
import { CampaignWith } from '../../campaigns/campaigns.types'
import { VoterFileType } from '../../voters/voterFile/voterFile.types'
import { Readable } from 'stream'
import { StreamableFile } from '@nestjs/common'
import { PeerlyPhoneListPollingMessage } from '../../queue/queue.types'

// Polling Configuration Constants
const POLLING_MAX_ATTEMPTS = parseInt(process.env.PEERLY_POLLING_MAX_ATTEMPTS || '60', 10)
const POLLING_INITIAL_DELAY_MS = parseInt(process.env.PEERLY_POLLING_INITIAL_DELAY_MS || '5000', 10)
const POLLING_MAX_DELAY_MS = parseInt(process.env.PEERLY_POLLING_MAX_DELAY_MS || '30000', 10)
const POLLING_BACKOFF_MULTIPLIER = parseFloat(process.env.PEERLY_POLLING_BACKOFF_MULTIPLIER || '1.5')

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
export class PeerlyPollingService {
  private readonly logger = new Logger(PeerlyPollingService.name)

  constructor(
    private readonly phoneListService: PeerlyPhoneListService,
    private readonly mediaService: PeerlyMediaService,
    private readonly p2pSmsService: PeerlyP2pSmsService,
    private readonly voterFileService: VoterFileService,
    private readonly enqueueService: EnqueueService,
  ) {}

  async initiateP2pCampaign(params: CreateP2pCampaignParams): Promise<void> {
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

      // Step 3: Queue polling message for phone list processing
      await this.queuePhoneListPolling({
        listToken,
        campaignId: campaign.id.toString(),
        jobName,
        messageTemplates: await this.serializeMessageTemplates(messageTemplates, mediaIds),
        didState,
        identityId,
        attempt: 0,
        maxAttempts: POLLING_MAX_ATTEMPTS,
        delayMs: POLLING_INITIAL_DELAY_MS,
      })

      this.logger.log(`P2P campaign initiation queued for polling. Token: ${listToken}`)
    } catch (error) {
      this.logger.error('Failed to initiate P2P campaign:', error)
      throw error
    }
  }

  async queuePhoneListPolling(message: PeerlyPhoneListPollingMessage): Promise<void> {
    const queueMessage = {
      type: 'peerlyPhoneListPolling',
      data: message,
    }

    // Calculate delay based on attempt number
    const delaySeconds = Math.floor(message.delayMs / 1000)
    
    await this.enqueueService.sendMessage(queueMessage, MessageGroup.peerly)
    
    this.logger.log(`Queued phone list polling check for token ${message.listToken}, attempt ${message.attempt + 1}, delay: ${delaySeconds}s`)
  }

  async handlePhoneListPolling(message: PeerlyPhoneListPollingMessage): Promise<void> {
    const { listToken, attempt, maxAttempts, delayMs } = message

    try {
      // Check phone list status
      this.logger.log(`Checking phone list status for token ${listToken}, attempt ${attempt + 1}`)
      const listStatus = await this.phoneListService.checkPhoneListStatus(listToken)

      if (listStatus.list_status === 'ACTIVE' && listStatus.list_id) {
        // List is ready, continue with P2P job creation
        this.logger.log(`Phone list ready: ${listStatus.list_id}`)
        await this.completeP2pCampaign(message, listStatus.list_id)
      } else if (attempt >= maxAttempts) {
        // Max attempts reached
        const error = new Error(`Phone list polling failed after ${maxAttempts} attempts`)
        this.logger.error(error.message)
        throw error
      } else {
        // Requeue with exponential backoff
        const nextDelay = Math.min(delayMs * POLLING_BACKOFF_MULTIPLIER, POLLING_MAX_DELAY_MS)
        await this.queuePhoneListPolling({
          ...message,
          attempt: attempt + 1,
          delayMs: nextDelay,
        })
      }
    } catch (error) {
      this.logger.error(`Phone list polling failed for token ${listToken}:`, error)
      throw error
    }
  }

  private async completeP2pCampaign(message: PeerlyPhoneListPollingMessage, listId: number): Promise<void> {
    const { campaignId, jobName, messageTemplates, didState, identityId } = message

    try {
      // Deserialize message templates
      const templates = await this.deserializeMessageTemplates(messageTemplates)

      // Step 4: Create P2P job with templates
      this.logger.log('Creating P2P job...')
      const jobId = await this.p2pSmsService.createJob({
        name: jobName,
        templates,
        didState,
        identityId,
      })

      // Step 5: Assign list to job
      this.logger.log('Assigning phone list to job...')
      await this.p2pSmsService.assignListToJob(jobId, listId)

      this.logger.log(`P2P campaign created successfully. Job ID: ${jobId}, List ID: ${listId}`)

      // TODO: Store result or send notification
      // Could queue a completion message or update database
    } catch (error) {
      this.logger.error('Failed to complete P2P campaign:', error)
      throw error
    }
  }

  private async serializeMessageTemplates(
    templates: Array<{
      title: string
      text: string
      mediaStream?: {
        stream: Readable
        fileName: string
        mimeType: string
        fileSize?: number
      }
    }>,
    mediaIds: string[],
  ): Promise<Array<{
    title: string
    text: string
    mediaStream?: {
      stream: string
      fileName: string
      mimeType: string
      fileSize?: number
    }
  }>> {
    // For queue serialization, we replace the actual streams with media IDs
    // since streams can't be serialized and media is already uploaded
    return templates.map((template, index) => ({
      title: template.title,
      text: template.text,
      ...(template.mediaStream && {
        mediaStream: {
          stream: mediaIds[index] || '', // Store media ID instead of stream
          fileName: template.mediaStream.fileName,
          mimeType: template.mediaStream.mimeType,
          fileSize: template.mediaStream.fileSize,
        },
      }),
    }))
  }

  private async deserializeMessageTemplates(
    serializedTemplates: Array<{
      title: string
      text: string
      mediaStream?: {
        stream: string
        fileName: string
        mimeType: string
        fileSize?: number
      }
    }>,
  ): Promise<Array<{
    title: string
    text: string
    advanced?: {
      media: {
        media_id: string
        media_type: 'IMAGE' | 'VIDEO'
      }
    }
  }>> {
    return serializedTemplates.map((template) => ({
      title: template.title,
      text: template.text,
      ...(template.mediaStream?.stream && {
        advanced: {
          media: {
            media_id: template.mediaStream.stream, // This is actually the media ID
            media_type: template.mediaStream.mimeType.startsWith('video/')
              ? ('VIDEO' as const)
              : ('IMAGE' as const),
          },
        },
      }),
    }))
  }
}