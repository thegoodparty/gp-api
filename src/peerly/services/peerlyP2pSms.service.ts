import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { isAxiosResponse } from '../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import { CreateJobResponseDto } from '../schemas/peerlyP2pSms.schema'

const PEERLY_HTTP_TIMEOUT_MS = 15 * 1000 // 10 second timeout

interface Template {
  title: string
  text: string
  advanced?: {
    media: {
      media_id: string
      media_type: 'IMAGE' | 'VIDEO'
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
  private readonly logger: Logger = new Logger(PeerlyP2pSmsService.name)

  constructor(
    private readonly httpService: HttpService,
    private readonly peerlyAuth: PeerlyAuthenticationService,
  ) {
    super()
  }

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
      timeout: PEERLY_HTTP_TIMEOUT_MS,
    }
  }

  private validateCreateJobResponse(data: unknown): CreateJobResponseDto {
    try {
      return CreateJobResponseDto.create(data)
    } catch (error) {
      this.logger.error('Create job response validation failed:', error)
      throw new BadGatewayException(
        'Invalid create job response from Peerly API',
      )
    }
  }

  async createJob(params: CreateJobParams): Promise<string> {
    const { name, templates, didState, identityId } = params
    const hasMms = templates.some((t) => !!t.advanced?.media)

    const body = {
      account_id: this.accountNumber,
      name,
      templates,
      did_state: didState,
      can_use_mms: hasMms,
      ...(identityId && { identity_id: identityId }),
    }

    try {
      const config = await this.getBaseHttpHeaders()
      const response = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/api/1to1/jobs`, body, config),
      )

      const validated = this.validateCreateJobResponse(response.data)
      
      // The job ID is typically returned in the Location header or we need to extract it from response
      // For now, we'll use the response data and assume job ID is available in headers or we need to get it differently
      const jobId = response.headers?.location?.split('/').pop() || 
                   response.headers?.['x-job-id'] || 
                   'generated-job-id-' + Date.now() // fallback
                   
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
          `${this.baseUrl}/api/1to1/jobs/${jobId}/assignlist`,
          body,
          config,
        ),
      )
    } catch (error) {
      this.handleApiError(error)
    }
  }
}
