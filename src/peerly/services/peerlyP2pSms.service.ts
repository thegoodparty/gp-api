import { BadGatewayException, Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { isAxiosResponse } from '../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import { CreateJobResponseDto } from '../schemas/peerlyP2pSms.schema'
import { MediaType } from '../peerly.types'
import { P2P_JOB_DEFAULTS } from '../constants/p2pJob.constants'

interface Template {
  title: string
  text: string
  advanced?: {
    media: {
      media_id: string
      media_type: MediaType
    }
  }
}

interface CreateJobParams {
  name: string
  templates: Template[]
  didState: string
  identityId?: string
}

@Injectable()
export class PeerlyP2pSmsService extends PeerlyBaseConfig {
  constructor(
    private readonly httpService: HttpService,
    private readonly peerlyAuth: PeerlyAuthenticationService,
  ) {
    super()
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private handleApiError(error: unknown): never {
    this.logger.error(
      'Failed to communicate with Peerly API',
      isAxiosResponse(error) ? format(error) : error,
    )
    throw new BadGatewayException('Failed to communicate with Peerly API')
  }

  private async getBaseHttpHeaders() {
    return {
      headers: await this.peerlyAuth.getAuthorizationHeader(),
      timeout: this.httpTimeoutMs,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private validateCreateJobResponse(data: unknown): CreateJobResponseDto {
    return this.validateData(data, CreateJobResponseDto, 'create job')
  }

  async createJob(params: CreateJobParams): Promise<string> {
    const { name, templates, didState, identityId } = params
    const hasMms = templates.some((t) => !!t.advanced?.media)

    const body = {
      account_id: this.accountNumber,
      name,
      templates,
      can_use_mms: hasMms,
      ...(identityId && { identity_id: identityId }),
    }

    try {
      const config = await this.getBaseHttpHeaders()
      const response = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/1to1/jobs`, body, config),
      )

      const validated = this.validateCreateJobResponse(response.data)

      // TODO: Verify where the job ID is actually returned by the Peerly API
      // Based on standard REST patterns, it should be in either:
      // 1. Response body (most likely - update schema if needed)
      // 2. Location header pointing to the created resource
      // The API docs may be incomplete - need to test with real API response

      let jobId: string | undefined

      // First check response body for job ID (most likely location)
      if ((response.data as any)?.id) {
        jobId = (response.data as any).id
      }

      // Fallback to Location header if not in body
      if (!jobId && response.headers?.location) {
        jobId = response.headers.location.split('/').pop()
      }

      if (!jobId) {
        this.logger.error('Job created but no job ID found in response', {
          headers: response.headers,
          data: response.data,
        })
        throw new BadGatewayException(
          'Job creation succeeded but job ID not found in response body or headers. Please verify API response format.',
        )
      }

      this.logger.log(`Created job with ID: ${jobId}`)
      return jobId
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async assignListToJob(jobId: string, listId: number): Promise<void> {
    const body = {
      list_id: listId,
    }

    try {
      const config = await this.getBaseHttpHeaders()
      await lastValueFrom(
        this.httpService.post(
          `${this.baseUrl}/1to1/jobs/${jobId}/assignlist`,
          body,
          config,
        ),
      )
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async requestCanvassers(
    jobId: string,
    initials: string = P2P_JOB_DEFAULTS.CANVASSER_INITIALS,
  ): Promise<void> {
    const body = {
      requested_initials: initials,
    }

    try {
      const config = await this.getBaseHttpHeaders()
      await lastValueFrom(
        this.httpService.post(
          `${this.baseUrl}/v2/p2p/${jobId}/request_canvassers`,
          body,
          config,
        ),
      )
      this.logger.log(`Requested canvassers for job ID: ${jobId}`)
    } catch (error) {
      this.handleApiError(error)
    }
  }
}
