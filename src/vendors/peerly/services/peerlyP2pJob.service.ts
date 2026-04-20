import { BadGatewayException, Injectable } from '@nestjs/common'
import { formatISO } from 'date-fns'
import { Headers } from 'http-constants-ts'
import { Readable } from 'stream'
import { PinoLogger } from 'nestjs-pino'
import {
  P2P_ERROR_MESSAGES,
  P2P_JOB_DEFAULTS,
} from '../constants/p2pJob.constants'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { PeerlyErrorHandlingService } from './peerlyErrorHandling.service'
import { PeerlyHttpService } from './peerlyHttp.service'
import { PeerlyMediaService } from './peerlyMedia.service'
import { PeerlyScheduleService } from './peerlySchedule.service'
import { CreateJobResponseDto } from '../schemas/peerlyP2pSms.schema'
import { CreateJobParams, PeerlyJob } from '../peerly.types'

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
  didNpaSubset?: string[]
  scheduledDate?: string
}

@Injectable()
export class PeerlyP2pJobService extends PeerlyBaseConfig {
  constructor(
    protected readonly logger: PinoLogger,
    private readonly peerlyMediaService: PeerlyMediaService,
    private readonly peerlyScheduleService: PeerlyScheduleService,
    private readonly peerlyHttpService: PeerlyHttpService,
    private readonly peerlyErrorHandling: PeerlyErrorHandlingService,
  ) {
    super(logger)
  }

  async createPeerlyP2pJob({
    campaignId,
    listId,
    imageInfo,
    scriptText,
    identityId,
    name = P2P_JOB_DEFAULTS.CAMPAIGN_NAME,
    didState = P2P_JOB_DEFAULTS.DID_STATE,
    didNpaSubset = [],
    scheduledDate,
  }: CreateP2pJobParams): Promise<string> {
    let jobId: string | undefined
    let scheduleId: number | undefined

    try {
      this.logger.info('Creating media for P2P job')
      const mediaId = await this.peerlyMediaService.createMedia({
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

      const targetDate = dateOnly || 'no-date'
      const createdAt = formatISO(new Date())
      const scheduleName = `GP P2P - Campaign ${campaignId} - ${targetDate} - ${createdAt}`
      scheduleId =
        await this.peerlyScheduleService.createSchedule(scheduleName)

      this.logger.info('Creating P2P job')
      jobId = await this.createJob({
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
        scheduleId,
      })
      this.logger.info(`Job created with ID: ${jobId}`)

      this.logger.info(`Assigning list ${listId} to job ${jobId}`)
      await this.assignListToJob(jobId, listId, { campaignId, scheduleId })
      this.logger.info('List assigned successfully')

      this.logger.info(
        `P2P job creation completed successfully for campaign ${campaignId}`,
      )

      return jobId
    } catch (error) {
      const isListAssignmentFailure =
        error instanceof BadGatewayException &&
        error.message.includes(P2P_ERROR_MESSAGES.LIST_ASSIGNMENT_FAILED)
      if (isListAssignmentFailure) {
        throw error
      }
      this.logger.error(
        { error, scheduleId },
        P2P_ERROR_MESSAGES.JOB_CREATION_FAILED,
      )
      throw new BadGatewayException(P2P_ERROR_MESSAGES.JOB_CREATION_FAILED)
    }
  }

  async getJobsByIdentityId(identityId: string): Promise<PeerlyJob[]> {
    try {
      this.logger.debug(`Getting P2P jobs list for ${identityId}`)
      const response = await this.peerlyHttpService.get<PeerlyJob[]>(
        `/1to1/jobs?account_id=${this.accountNumber}&identity_id=${identityId}`,
      )
      const { data: jobs } = response
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
      const response = await this.peerlyHttpService.get<PeerlyJob>(
        `/1to1/jobs/${jobId}`,
      )
      const { data: job } = response
      this.logger.debug({ job }, 'Fetched P2P Job:')
      return job
    } catch (error) {
      this.logger.error({ error }, P2P_ERROR_MESSAGES.RETRIEVE_JOB_FAILED)
      throw new BadGatewayException(P2P_ERROR_MESSAGES.RETRIEVE_JOB_FAILED)
    }
  }

  private async createJob({
    name,
    templates,
    didState,
    didNpaSubset = [],
    identityId,
    scheduledDate,
    scheduleId,
  }: CreateJobParams): Promise<string> {
    const hasMms = templates.some((t) => !!t.media)

    const body = {
      account_id: this.accountNumber,
      name,
      templates,
      did_state: didState,
      ...(didNpaSubset.length > 0 && { did_npa_subset: didNpaSubset }),
      can_use_mms: hasMms,
      schedule_id: scheduleId,
      ...(identityId && { identity_id: identityId }),
      ...(scheduledDate && {
        start_date: scheduledDate,
        end_date: scheduledDate,
      }),
    }

    try {
      this.logger.debug({ body }, 'Creating Peerly job with body:')
      const response = await this.peerlyHttpService.post('/1to1/jobs', body)

      const { data } = response
      const validated = this.peerlyHttpService.validateResponse(
        data,
        CreateJobResponseDto,
        'create job',
      )

      let jobId: string | undefined = validated.id || undefined

      if (!jobId) {
        const locationHeader = String(
          response.headers?.[Headers.LOCATION.toLowerCase()] ?? '',
        )
        if (locationHeader) {
          jobId = locationHeader.split('/').pop()
        }
      }

      if (!jobId) {
        this.logger.error(
          { headers: response.headers, data },
          'Job created but no job ID found in response',
        )
        throw new BadGatewayException(
          'Job creation succeeded but job ID not found in response body or headers.',
        )
      }

      this.logger.info(`Created job with ID: ${jobId}`)
      return jobId
    } catch (error) {
      return this.peerlyErrorHandling.handleApiError({
        error,
        logger: this.logger,
      })
    }
  }

  private async assignListToJob(
    jobId: string,
    listId: number,
    context?: { campaignId?: number; scheduleId?: number },
  ): Promise<void> {
    try {
      await this.peerlyHttpService.post(`/1to1/jobs/${jobId}/assignlist`, {
        list_id: listId,
      })
    } catch (error) {
      return this.peerlyErrorHandling.handleApiError({
        error,
        context: {
          customMessage: P2P_ERROR_MESSAGES.LIST_ASSIGNMENT_FAILED,
          recoveryInfo: {
            jobId,
            listId,
            ...(context?.campaignId != null && {
              campaignId: context.campaignId,
            }),
            ...(context?.scheduleId != null && {
              scheduleId: context.scheduleId,
            }),
          },
        },
        logger: this.logger,
      })
    }
  }
}
