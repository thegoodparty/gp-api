import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { PeerlyMediaService } from './peerlyMedia.service'
import { PeerlyJob, PeerlyP2pSmsService } from './peerlyP2pSms.service'
import { Readable } from 'stream'
import {
  P2P_ERROR_MESSAGES,
  P2P_JOB_DEFAULTS,
} from '../constants/p2pJob.constants'

const { PEERLY_API_BASE_URL, PEERLY_ACCOUNT_NUMBER } = process.env

interface CreateP2pJobParams {
  campaignId: number
  listId: number
  imageInfo: {
    fileStream: Readable | Buffer
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
  ) {}

  async createPeerlyP2pJob({
    campaignId,
    listId,
    imageInfo,
    scriptText,
    identityId,
    name = P2P_JOB_DEFAULTS.CAMPAIGN_NAME,
    didState = P2P_JOB_DEFAULTS.DID_STATE,
  }: CreateP2pJobParams): Promise<string> {
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
            is_default: true,
            title: P2P_JOB_DEFAULTS.TEMPLATE_TITLE,
            text: scriptText,
            media: {
              media_type: 'IMAGE',
              media_id: mediaId,
              title: imageInfo.title || P2P_JOB_DEFAULTS.TEMPLATE_TITLE,
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

  async getJobsByIdentityId(identityId: string): Promise<PeerlyJob[]> {
    try {
      this.logger.debug(`Getting P2P jobs list for ${identityId}`)
      const jobs =
        await this.peerlyP2pSmsService.retrieveJobsListByIdentityId(identityId)
      this.logger.debug(`Fetched P2P Jobs: ${JSON.stringify(jobs)}`)
      return jobs
    } catch (error) {
      this.logger.error(P2P_ERROR_MESSAGES.RETRIEVE_JOBS_FAILED, error)
      throw new BadGatewayException(P2P_ERROR_MESSAGES.RETRIEVE_JOBS_FAILED)
    }
  }

  async getJob(jobId: string): Promise<PeerlyJob> {
    try {
      this.logger.debug(`Getting job ${jobId}`)
      const job = await this.peerlyP2pSmsService.retrieveJob(jobId)
      this.logger.debug(`Fetched P2P Job: ${JSON.stringify(job)}`)
      return job
    } catch (error) {
      this.logger.error(P2P_ERROR_MESSAGES.RETRIEVE_JOB_FAILED, error)
      throw new BadGatewayException(P2P_ERROR_MESSAGES.RETRIEVE_JOB_FAILED)
    }
  }

  getPeerlyJobUrl(jobId: string): string {
    if (!PEERLY_API_BASE_URL) {
      throw new BadGatewayException('PEERLY_API_BASE_URL is not configured')
    }
    if (!PEERLY_ACCOUNT_NUMBER) {
      throw new BadGatewayException('PEERLY_ACCOUNT_NUMBER is not configured')
    }
    const peerlyWebUrl = PEERLY_API_BASE_URL.replace('/api', '')
    return `${peerlyWebUrl}/accounts/${PEERLY_ACCOUNT_NUMBER}/jobs/${jobId}`
  }
}
