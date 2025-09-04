import { BadGatewayException, Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { lastValueFrom } from 'rxjs'
import {
  PeerlyAuthenticatedUser,
  PeerlyAuthenticationService,
} from './peerlyAuthentication.service'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { isAxiosResponse } from '../../shared/util/http.util'
import { format } from '@redtea/format-axios-error'
import { CreateJobResponseDto } from '../schemas/peerlyP2pSms.schema'
import { AxiosResponse } from 'axios'

interface Template {
  is_default: boolean
  title: string
  text: string
  advanced?: {
    show_stop: boolean
    organization?: string
    bodies?: Array<{
      text: string
    }>
    call_to_actions?: Array<{
      text: string
      url?: string
    }>
  }
  media?: {
    media_type: string
    media_id: string
    title: string
  }
}

interface CreateJobParams {
  name: string
  templates: Template[]
  didState: string
  identityId?: string
}

interface PeerlyApiErrorResponse {
  error?: string
  message?: string
  Error?: string // Peerly API uses 'Error' with capital E
  details?: unknown
  [key: string]: unknown
}

interface PeerlyApiResponse {
  id?: string
  [key: string]: unknown
}

type PeerlyAxiosError = {
  response?: AxiosResponse<PeerlyApiErrorResponse>
  [key: string]: unknown
}

@Injectable()
export class PeerlyP2pSmsService extends PeerlyBaseConfig {
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

    if (isAxiosResponse(error)) {
      const axiosError = error as PeerlyAxiosError
      if (axiosError.response?.data) {
        this.logger.error(
          'Peerly API error response:',
          JSON.stringify(axiosError.response.data, null, 2),
        )

        const apiError = axiosError.response.data
        const errorMessage =
          apiError.error ||
          apiError.message ||
          apiError.Error ||
          'Unknown API error'
        throw new BadGatewayException(`Peerly API error: ${errorMessage}`)
      }
    }

    throw new BadGatewayException('Failed to communicate with Peerly API')
  }

  private async getBaseHttpHeaders() {
    return {
      headers: await this.peerlyAuth.getAuthorizationHeader(),
      timeout: this.httpTimeoutMs,
    }
  }

  private validateCreateJobResponse(data: unknown): CreateJobResponseDto {
    return this.validateData(data, CreateJobResponseDto, 'create job')
  }

  async createJob(params: CreateJobParams): Promise<string> {
    const { name, templates, didState, identityId } = params
    const hasMms = templates.some((t) => !!t.media)

    const body = {
      account_id: this.accountNumber,
      name,
      templates,
      did_state: didState,
      can_use_mms: hasMms,
      schedule_id: this.scheduleId,
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
      const responseData = response.data as PeerlyApiResponse
      if (responseData?.id) {
        jobId = responseData.id
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

  async requestCanvassers(jobId: string): Promise<void> {
    const authenticatedUser = await this.peerlyAuth.getAuthenticatedUser()
    if (!authenticatedUser) {
      throw new BadGatewayException(
        'Cannot request canvassers: No authenticated user',
      )
    }

    const body = {
      requested_initials: getAuthenticatedUserInitials(authenticatedUser),
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

const getAuthenticatedUserInitials = (user: PeerlyAuthenticatedUser) => {
  const firstInitial = user.first_name ? user.first_name.charAt(0) : ''
  const lastInitial = user.last_name ? user.last_name.charAt(0) : ''
  return (firstInitial + lastInitial).toUpperCase()
}
