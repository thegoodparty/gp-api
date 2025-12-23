import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable } from '@nestjs/common'
import { format } from '@redtea/format-axios-error'
import { AxiosResponse } from 'axios'
import { lastValueFrom } from 'rxjs'
import { CrmCampaignsService } from 'src/campaigns/services/crmCampaigns.service'
import { isAxiosResponse } from '../../../shared/util/http.util'
import { PeerlyBaseConfig } from '../config/peerlyBaseConfig'
import { CreateJobResponseDto } from '../schemas/peerlyP2pSms.schema'
import { getAuthenticatedUserInitials } from '../utils/getAuthenticatedUserInitials.util'
import { PeerlyAuthenticationService } from './peerlyAuthentication.service'

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
  crmCompanyId: string
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

interface PeerlyAgent {
  id: string
  display_email: string
  status?: string
}

export enum PeerlyJobStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  DELETED = 'deleted',
  PENDING = 'pending',
  ERROR = 'error',
}

export interface PeerlyJob {
  id: string
  account_id: string
  identity_id: string
  name: string
  internal_name: string
  status: PeerlyJobStatus
  job_type: string
  created_date: string
  created_by: string
  last_touched_date: string
  start_date: string
  end_date: string
  schedule_id: number
  did_state: string
  did_npa_subset: string[]
  disable_did_purchase: boolean
  can_use_mms: boolean
  ai_enabled: boolean
  ai_auto_opt_out_threshold: string
  deliverability_check: boolean
  deliverability_check_error?: string
  dynamic_reassignment: boolean
  can_add_new_lead: boolean
  has_canvassers_scheduled: boolean
  leads_remaining: number
  agent_ids: string[]
  agents: Record<string, never>
  phone_lists: number[]
  phone_list_assignments: Array<{
    list_id: number
    deduplicate: boolean
  }>
  suppression_list_assignments: string[]
  templates: Array<{
    id: string
    title: string
    text: string
    is_default: boolean
    has_dynamic_media: boolean
    has_dynamic_media_rendered: boolean
    media?: {
      media_id: string
      media_type: string
      title: string
    }
    advanced?: {
      show_stop: boolean
      organization?: string
      bodies?: string[]
      minimized?: boolean
      call_to_actions?: Array<{
        text: string
        url?: string
      }>
    }
  }>
  canvassers_schedule?: {
    requested_initials: string
    requested_date: string
    requested_at: string
    requested_start_time: string
    requested_end_time: string
    requested_timezone: string
    requested_timeframe: string
    requested_by: string
    start_time: string
    end_time: string
    approved: boolean
  }
  questions: string[]
  tracked_links: string[]
  integrations: string[]
}

type PeerlyAxiosError = {
  response?: AxiosResponse<PeerlyApiErrorResponse>
  [key: string]: unknown
}

@Injectable()
export class PeerlyP2pSmsService extends PeerlyBaseConfig {
  constructor(
    private readonly httpService: HttpService,
    private readonly crmCampaigns: CrmCampaignsService,
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
        const { error: errorField, message, Error: errorCapital } = apiError
        const errorMessage =
          errorField || message || errorCapital || 'Unknown API error'
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

  async createJob({
    crmCompanyId,
    name,
    templates,
    didState,
    identityId,
  }: CreateJobParams): Promise<string> {
    const hasMms = templates.some((t) => !!t.media)

    /// here we need to get the agent email from hubspot and call the getAgentIdByEmail method to get the agent id and then use it in the agent_ids array

    // Automatically assign PA as agent in Peerly
    // NOTE: This fetches agent list from Peerly on every job creation (see listAgents() for caching notes)
    let agentIds: string[] = []
    try {
      const owner = crmCompanyId ? await this.crmCampaigns.getCrmCompanyOwner(crmCompanyId) : null
      const agentId = owner?.email ? await this.getAgentIdByEmail(owner.email) : null
      if (agentId) {
        agentIds.push(agentId)
        this.logger.log(`Successfully assigned agent ${agentId} to job`)
      } else if (owner?.email) {
        this.logger.warn(`No Peerly agent found for PA email: ${owner.email}`)
      }
    } catch (error) {
      this.logger.error(
        'Failed to assign PA as agent, creating job without agent assignment',
        error,
      )
      // Job creation continues without agent assignment - graceful degradation
    }

    const body = {
      account_id: this.accountNumber,
      name,
      templates,
      did_state: didState,
      can_use_mms: hasMms,
      ...(agentIds.length > 0 && { agent_ids: agentIds }),
      // TODO: This doesn't appear to be used. But we _also_ aren't sending the
      //  `date` value to Peerly either. So how in the world are we setting send
      //  dates for messages? 🤔
      schedule_id: this.scheduleId,
      ...(identityId && { identity_id: identityId }),
    }

    try {
      const config = await this.getBaseHttpHeaders()
      this.logger.debug(
        `Creating Peerly job with body: ${JSON.stringify(body)}`,
      )
      const response = await lastValueFrom(
        this.httpService.post(`${this.baseUrl}/1to1/jobs`, body, config),
      )

      const { data } = response as {
        data: Record<string, string | number | boolean>
      }
      this.validateCreateJobResponse(data)

      let jobId: string | undefined

      // First check response body for job ID (most likely location)
      const responseData = data as PeerlyApiResponse
      if (responseData?.id) {
        jobId = responseData.id
      }

      // Fallback to Location header if not in body
      const { headers } = response as {
        headers: { location?: string }
      }
      if (!jobId && headers?.location) {
        jobId = headers.location.split('/').pop()
      }

      if (!jobId) {
        this.logger.error('Job created but no job ID found in response', {
          headers,
          data: data as Record<string, string | number | boolean>,
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
  async retrieveJobsListByIdentityId(identityId: string): Promise<PeerlyJob[]> {
    try {
      const config = await this.getBaseHttpHeaders()
      const response: AxiosResponse<PeerlyJob[]> = await lastValueFrom(
        this.httpService.get(
          `${this.baseUrl}/1to1/jobs?account_id=${this.accountNumber}&identity_id=${identityId}`,
          config,
        ),
      )

      // Validate and return the job details
      const { data: jobs } = response
      this.logger.debug(`Retrieved P2P jobs: ${JSON.stringify(jobs)}`)
      return jobs
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async retrieveJob(id: string): Promise<PeerlyJob> {
    try {
      const config = await this.getBaseHttpHeaders()
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/1to1/jobs/${id}`, config),
      )

      // Validate and return the job details
      const { data } = response as { data: PeerlyJob }
      const jobDetails = data
      this.logger.debug(`Retrieved job details: ${JSON.stringify(jobDetails)}`)
      return jobDetails
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

  /**
   * Fetches all agents from Peerly API
   *
   * NOTE: This currently fetches fresh data on every call (no caching).
   * Agent list changes infrequently, so caching could improve performance.
   *
   * Consider adding in-memory cache (5-min TTL) if:
   * - Job creation latency becomes > 1s
   * - Volume exceeds 50+ jobs/day
   * - Peerly API reliability issues occur
   *
   * Cache implementation suggestion:
   * - Use class properties: agentsCache[], lastFetch timestamp, CACHE_TTL
   * - Fallback to stale cache if API call fails
   * - Clear cache on repeated assignment failures
   */
  async listAgents(): Promise<PeerlyAgent[]> {
    try {
      const config = await this.getBaseHttpHeaders()
      const response = await lastValueFrom(
        this.httpService.get(`${this.baseUrl}/1to1/agents`, config),
      )
      this.logger.debug(`Fetched ${response.data.length} Peerly agents`)
      return response.data
    } catch (error) {
      this.handleApiError(error)
    }
  }

  async getAgentIdByEmail(email: string): Promise<string | null> {
    if (!email || !email.trim()) {
      return null
    }

    const normalizedEmail = email.toLowerCase()
    const agents = await this.listAgents()
    const agent = agents.find(
      a =>
        a.display_email &&
        a.status === 'active' &&
        a.display_email.toLowerCase() === normalizedEmail,
    )
    return agent?.id || null
  }
}
