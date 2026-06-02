import { HttpService } from '@nestjs/axios'
import { BadGatewayException, Injectable } from '@nestjs/common'
import { isAxiosError } from 'axios'
import { PinoLogger } from 'nestjs-pino'
import { lastValueFrom } from 'rxjs'
import { z } from 'zod'
import { ApiCandidate, RaceContextFromApi } from '../types/electionApi.types'

// Distinguishable error for the 404 case (election-api has no Race row
// for the candidate's brHashId). Callers in CampaignStrategyService use
// this to break the infinite-poll loop by persisting a "no data" marker
// instead of retrying generation every 3 seconds.
export class ElectionApiRaceNotFoundError extends Error {
  constructor(public readonly brHashId: string) {
    super(`election-api has no Race row for brHashId=${brHashId}`)
    this.name = 'ElectionApiRaceNotFoundError'
  }
}

const ApiCandidateSchema = z.object({
  gp_candidate_id: z.string().nullable(),
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
  email: z.string().nullable(),
  website_url: z.string().nullable(),
  party: z.string().nullable(),
  is_incumbent: z.boolean().nullable(),
})

const ApiResponseSchema = z.object({
  candidate_count: z.number(),
  candidate_office: z.string().nullable(),
  candidates: z.array(ApiCandidateSchema),
  civics_win_number: z.number().nullable(),
  contacts_needed_estimate: z.number().nullable(),
  general_election_date: z.string().nullable(),
  number_of_seats: z.number().nullable(),
  office_level: z.string().nullable(),
  office_type: z.string().nullable(),
  official_office_name: z.string().nullable(),
  primary_election_date: z.string().nullable(),
  projected_turnout: z.number().nullable(),
  relevant_election_date: z.string().nullable(),
  state: z.string().nullable(),
  win_number_effective: z.number().nullable(),
  win_number_estimate: z.number().nullable(),
})

type ApiResponse = z.infer<typeof ApiResponseSchema>
type ApiCandidateRaw = z.infer<typeof ApiCandidateSchema>

const toCandidate = (c: ApiCandidateRaw): ApiCandidate => ({
  gpCandidateId: c.gp_candidate_id,
  firstName: c.first_name,
  lastName: c.last_name,
  fullName: c.full_name,
  email: c.email,
  websiteUrl: c.website_url,
  party: c.party,
  isIncumbent: c.is_incumbent,
})

// Substring match (case-insensitive) on the email. Filters out internal
// test candidates (e.g. someone@goodparty.org) seeded against real races
// so they don't leak into the LLM prompt as if they were genuine
// opponents. candidateCount is recomputed from the filtered array to
// keep the two fields consistent.
const TEST_CANDIDATE_EMAIL_MARKER = '@goodparty'

const isTestCandidate = (c: ApiCandidate): boolean =>
  c.email !== null &&
  c.email.toLowerCase().includes(TEST_CANDIDATE_EMAIL_MARKER)

const toRaceContext = (data: ApiResponse): RaceContextFromApi => {
  const candidates = data.candidates
    .map(toCandidate)
    .filter((c) => !isTestCandidate(c))
  return {
    state: data.state,
    candidateOffice: data.candidate_office,
    officialOfficeName: data.official_office_name,
    officeLevel: data.office_level,
    officeType: data.office_type,
    primaryElectionDate: data.primary_election_date,
    generalElectionDate: data.general_election_date,
    relevantElectionDate: data.relevant_election_date,
    numberOfSeats: data.number_of_seats,
    projectedTurnout: data.projected_turnout,
    civicsWinNumber: data.civics_win_number,
    winNumberEstimate: data.win_number_estimate,
    winNumberEffective: data.win_number_effective,
    contactsNeededEstimate: data.contacts_needed_estimate,
    candidateCount: candidates.length,
    candidates,
  }
}

@Injectable()
export class ElectionApiService {
  private static readonly PATH = 'v1/campaign-strategy-context'
  private readonly baseUrl: string

  constructor(
    private readonly httpService: HttpService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ElectionApiService.name)
    const baseUrl = process.env.ELECTION_API_URL
    if (!baseUrl) {
      throw new Error('ELECTION_API_URL is not set')
    }
    this.baseUrl = baseUrl
  }

  async getRaceContext(brHashId: string): Promise<RaceContextFromApi> {
    const url = `${this.baseUrl}/${ElectionApiService.PATH}`
    try {
      const { data } = await lastValueFrom(
        this.httpService.post<unknown>(url, { brHashId }),
      )
      const parsed = ApiResponseSchema.safeParse(data)
      if (!parsed.success) {
        this.logger.error(
          { issues: parsed.error.issues },
          'election-api response failed schema validation',
        )
        throw new BadGatewayException(
          'election-api returned an unexpected response shape',
        )
      }
      return toRaceContext(parsed.data)
    } catch (error) {
      if (error instanceof BadGatewayException) throw error
      const status = isAxiosError(error) ? error.response?.status : undefined
      if (status === 404) {
        // Throw at debug-log level (the caller decides whether to escalate).
        // This is usually a dev-env data gap that resolves on the next
        // election-api dbt run; not noisy-error-worthy on its own.
        this.logger.warn(
          { brHashId },
          'election-api has no Race row for brHashId; caller should mark race as unavailable',
        )
        throw new ElectionApiRaceNotFoundError(brHashId)
      }
      this.logger.error(
        {
          brHashId,
          status,
          message: error instanceof Error ? error.message : String(error),
        },
        'election-api campaign-strategy-context request failed',
      )
      throw new BadGatewayException('election-api request failed')
    }
  }
}
