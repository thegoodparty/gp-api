import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { PeerlyMediaService } from './peerlyMedia.service'
import { PeerlyP2pSmsService } from './peerlyP2pSms.service'
import { OutreachService } from '../../outreach/services/outreach.service'
import { OutreachType, OutreachStatus } from '@prisma/client'
import { MediaType } from '../peerly.types'
import { Readable } from 'stream'

interface CreateP2pJobParams {
  campaignId: number
  listId: number
  imageInfo: {
    fileStream: Readable
    fileName: string
    mimeType: string
    fileSize?: number
    title?: string
  }
  scriptText: string
  identityId: string
  name?: string
  didState?: string
}

@Injectable()
export class PeerlyP2pJobService {
  private readonly logger = new Logger(PeerlyP2pJobService.name)

  constructor(
    private readonly peerlyMediaService: PeerlyMediaService,
    private readonly peerlyP2pSmsService: PeerlyP2pSmsService,
    private readonly outreachService: OutreachService,
  ) {}

  async createP2pJob(params: CreateP2pJobParams): Promise<void> {
    const {
      campaignId,
      listId,
      imageInfo,
      scriptText,
      identityId,
      name = 'P2P SMS Campaign',
      didState = 'auto',
    } = params

    let mediaId: string | undefined
    let jobId: string | undefined

    try {
      // Step 1: Create Media
      this.logger.log('Creating media for P2P job')
      mediaId = await this.peerlyMediaService.createMedia({
        identityId,
        fileStream: imageInfo.fileStream,
        fileName: imageInfo.fileName,
        mimeType: imageInfo.mimeType,
        fileSize: imageInfo.fileSize,
        title: imageInfo.title,
      })
      this.logger.log(`Media created with ID: ${mediaId}`)

      // Step 2: Create Job
      this.logger.log('Creating P2P job')
      jobId = await this.peerlyP2pSmsService.createJob({
        name,
        templates: [
          {
            title: 'Default Template',
            text: scriptText,
            advanced: {
              media: {
                media_id: mediaId,
                media_type: MediaType.IMAGE,
              },
            },
          },
        ],
        didState,
        identityId,
      })
      this.logger.log(`Job created with ID: ${jobId}`)

      // Step 3: Add Single Phone List to Job
      this.logger.log(`Assigning list ${listId} to job ${jobId}`)
      await this.peerlyP2pSmsService.assignListToJob(jobId, listId)
      this.logger.log('List assigned successfully')

      // Step 4: Request Canvassers
      this.logger.log(`Requesting canvassers for job ${jobId}`)
      await this.peerlyP2pSmsService.requestCanvassers(jobId)
      this.logger.log('Canvassers requested successfully')

      // Step 5: Create OUTREACH record in database
      this.logger.log('Creating OUTREACH record in database')
      await this.outreachService.create({
        campaignId,
        outreachType: OutreachType.text,
        projectId: jobId,
        name,
        status: OutreachStatus.in_progress,
        script: scriptText,
      })
      this.logger.log('OUTREACH record created successfully')

      this.logger.log(
        `P2P job creation completed successfully for campaign ${campaignId}`,
      )
    } catch (error) {
      this.logger.error('Failed to create P2P job', error)

      // If we have a job ID, we could attempt cleanup here
      // For now, we'll let the error propagate and rely on manual cleanup if needed

      throw new BadGatewayException('Failed to create P2P job')
    }
  }
}
