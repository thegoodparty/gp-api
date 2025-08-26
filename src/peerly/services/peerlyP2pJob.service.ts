import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { PeerlyMediaService } from './peerlyMedia.service'
import { PeerlyP2pSmsService } from './peerlyP2pSms.service'
import { OutreachService } from '../../outreach/services/outreach.service'
import { OutreachType, OutreachStatus } from '@prisma/client'
import { MediaType } from '../peerly.types'
import { Readable } from 'stream'
import {
  P2P_JOB_DEFAULTS,
  P2P_ERROR_MESSAGES,
} from '../constants/p2pJob.constants'

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

  async createPeerlyP2pJob(params: CreateP2pJobParams): Promise<string> {
    const {
      campaignId,
      listId,
      imageInfo,
      scriptText,
      identityId,
      name = P2P_JOB_DEFAULTS.CAMPAIGN_NAME,
      didState = P2P_JOB_DEFAULTS.DID_STATE,
    } = params

    let mediaId: string | undefined
    let jobId: string | undefined

    try {
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

      this.logger.log('Creating P2P job')
      jobId = await this.peerlyP2pSmsService.createJob({
        name,
        templates: [
          {
            title: P2P_JOB_DEFAULTS.TEMPLATE_TITLE,
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

      this.logger.log(`Assigning list ${listId} to job ${jobId}`)
      await this.peerlyP2pSmsService.assignListToJob(jobId, listId)
      this.logger.log('List assigned successfully')

      this.logger.log(`Requesting canvassers for job ${jobId}`)
      await this.peerlyP2pSmsService.requestCanvassers(jobId)
      this.logger.log('Canvassers requested successfully')

      this.logger.log(
        `P2P job creation completed successfully for campaign ${campaignId}`,
      )

      return jobId
    } catch (error) {
      this.logger.error(P2P_ERROR_MESSAGES.JOB_CREATION_FAILED, error)

      // If we have a job ID, we could attempt cleanup here
      // For now, we'll let the error propagate and rely on manual cleanup if needed

      throw new BadGatewayException(P2P_ERROR_MESSAGES.JOB_CREATION_FAILED)
    }
  }
}
