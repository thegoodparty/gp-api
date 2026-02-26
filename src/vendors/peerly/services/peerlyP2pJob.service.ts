import { BadGatewayException, Injectable } from '@nestjs/common'
import { Readable } from 'stream'
import {
  P2P_ERROR_MESSAGES,
  P2P_JOB_DEFAULTS,
} from '../constants/p2pJob.constants'
import { PeerlyMediaService } from './peerlyMedia.service'
import { PeerlyJob, PeerlyP2pSmsService } from './peerlyP2pSms.service'
import { PinoLogger } from 'nestjs-pino'

interface CreateP2pJobParams {
  campaignId: number
  crmCompanyId?: string
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
  didNpaSubset?: string[]
  scheduledDate?: string
}

@Injectable()
export class PeerlyP2pJobService {
  constructor(
    private readonly peerlyMediaService: PeerlyMediaService,
    private readonly peerlyP2pSmsService: PeerlyP2pSmsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PeerlyP2pJobService.name)
  }

  async createPeerlyP2pJob({
    campaignId,
    crmCompanyId,
    listId,
    imageInfo,
    scriptText,
    identityId,
    name = P2P_JOB_DEFAULTS.CAMPAIGN_NAME,
    didState = P2P_JOB_DEFAULTS.DID_STATE,
    didNpaSubset = [],
    scheduledDate,
  }: CreateP2pJobParams): Promise<string> {
    let mediaId: string | undefined
    let jobId: string | undefined

    try {
      this.logger.info('Creating media for P2P job')
      mediaId = await this.peerlyMediaService.createMedia({
        identityId,
        fileStream: imageInfo.fileStream,
        fileName: imageInfo.fileName,
        mimeType: imageInfo.mimeType,
        fileSize: imageInfo.fileSize,
        title: imageInfo.title,
      })
      this.logger.info(`Media created with ID: ${mediaId}`)

      // extract date portion directly from ISO string to preserve the user's intended date
      const dateOnly = scheduledDate?.slice(0, 10)

      this.logger.info('Creating P2P job')
      jobId = await this.peerlyP2pSmsService.createJob({
        crmCompanyId: crmCompanyId || '',
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
        didNpaSubset,
        identityId,
        scheduledDate: dateOnly,
      })
      this.logger.info(`Job created with ID: ${jobId}`)

      this.logger.info(`Assigning list ${listId} to job ${jobId}`)
      await this.peerlyP2pSmsService.assignListToJob(jobId, listId)
      this.logger.info('List assigned successfully')

      this.logger.info(`Requesting canvassers for job ${jobId}`)
      await this.peerlyP2pSmsService.requestCanvassers(jobId)
      this.logger.info('Canvassers requested successfully')

      this.logger.info(
        `P2P job creation completed successfully for campaign ${campaignId}`,
      )

      return jobId
    } catch (error) {
      this.logger.error({ error }, P2P_ERROR_MESSAGES.JOB_CREATION_FAILED)

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
      this.logger.debug({ jobs }, 'Fetched P2P Jobs:')
      return jobs
    } catch (error) {
      this.logger.error({ error }, P2P_ERROR_MESSAGES.RETRIEVE_JOBS_FAILED)
      throw new BadGatewayException(P2P_ERROR_MESSAGES.RETRIEVE_JOBS_FAILED)
    }
  }

  async getJob(jobId: string): Promise<PeerlyJob> {
    try {
      this.logger.debug(`Getting job ${jobId}`)
      const job = await this.peerlyP2pSmsService.retrieveJob(jobId)
      this.logger.debug({ job }, 'Fetched P2P Job:')
      return job
    } catch (error) {
      this.logger.error({ error }, P2P_ERROR_MESSAGES.RETRIEVE_JOB_FAILED)
      throw new BadGatewayException(P2P_ERROR_MESSAGES.RETRIEVE_JOB_FAILED)
    }
  }
}
