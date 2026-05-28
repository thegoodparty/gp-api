import { HttpService } from '@nestjs/axios'
import {
  BadGatewayException,
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Organization } from '@prisma/client'
import { isAxiosError } from 'axios'
import { FastifyReply } from 'fastify'
import jwt from 'jsonwebtoken'
import { PinoLogger } from 'nestjs-pino'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import { lastValueFrom } from 'rxjs'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ElectionsService } from 'src/elections/services/elections.service'
import { VoterFileFilterService } from 'src/voters/services/voterFileFilter.service'
import { StatsResponse } from '../contacts.types'
import {
  DownloadContactsDTO,
  ListContactsDTO,
} from '../schemas/listContacts.schema'
import { PeopleListResponse, PersonOutput } from '../schemas/person.schema'
import type { SampleContacts } from '../schemas/sampleContacts.schema'
import defaultSegmentToFiltersMap from '../segmentsToFiltersMap.const'
import {
  convertVoterFileFilterToFilters,
  type FilterObject,
} from '../utils/voterFileFilter.utils'

const { PEOPLE_API_URL, PEOPLE_API_S2S_SECRET } = process.env

if (!PEOPLE_API_URL) {
  throw new Error('Please set PEOPLE_API_URL in your .env')
}
if (!PEOPLE_API_S2S_SECRET) {
  throw new Error('Please set PEOPLE_API_S2S_SECRET in your .env')
}

@Injectable()
export class ContactsService {
  private cachedToken: string | null = null

  constructor(
    private readonly httpService: HttpService,
    private readonly voterFileFilterService: VoterFileFilterService,
    private readonly elections: ElectionsService,
    private readonly campaigns: CampaignsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ContactsService.name)
  }

  private hasElectedOfficeAccess(organization: Organization): boolean {
    return organization.slug.startsWith('eo-')
  }

  private async isProAccess(organization: Organization): Promise<boolean> {
    if (this.hasElectedOfficeAccess(organization)) return true
    const campaign = await this.campaigns.findFirst({
      where: { organizationSlug: organization.slug },
      select: { isPro: true },
    })
    return campaign?.isPro ?? false
  }

  private async resolveDistrictInfoFromOrg(
    org: Organization,
  ): Promise<{ districtId: string | null }> {
    if (org.overrideDistrictId) {
      return { districtId: org.overrideDistrictId }
    }

    if (org.positionId) {
      const position = await this.elections.getPositionById(org.positionId, {
        includeDistrict: true,
      })
      return { districtId: position?.district?.id ?? null }
    }

    return { districtId: null }
  }

  private async withOrgDistrictResolution<Result>(
    org: Organization,
    fn: (params: { districtId: string }) => Promise<Result>,
  ): Promise<Result> {
    const { districtId } = await this.resolveDistrictInfoFromOrg(org)

    if (!districtId) {
      throw new BadRequestException(
        'Organization does not have sufficient data to resolve district',
      )
    }

    return fn({ districtId })
  }

  async findContacts(
    { resultsPerPage, page, search, segment }: ListContactsDTO,
    organization: Organization,
  ) {
    if (search && !(await this.isProAccess(organization))) {
      throw new BadRequestException(
        'Search is only available for pro campaigns',
      )
    }

    const fetchPeople = async (
      districtParams: { districtId: string },
      filters: FilterObject,
    ) => {
      try {
        const response = await lastValueFrom(
          this.httpService.post(
            `${PEOPLE_API_URL}/v1/people`,
            {
              ...districtParams,
              resultsPerPage,
              page,
              filters,
              search,
            },
            {
              headers: { Authorization: `Bearer ${this.getValidS2SToken()}` },
            },
          ),
        )
        // People API response is untyped — external API returns unknown response shape
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        return response.data as PeopleListResponse
      } catch (error) {
        this.logger.error({ error }, `Failed to fetch from people API`)
        throw new BadGatewayException(`Failed to fetch from people API`)
      }
    }

    const filters = await this.segmentToFilters(segment, organization)
    return this.withOrgDistrictResolution(organization, (params) =>
      fetchPeople(params, filters),
    )
  }

  async sampleContacts(dto: SampleContacts, organization: Organization) {
    const fetchSample = async (districtParams: { districtId: string }) => {
      const body = {
        ...districtParams,
        size: String(dto.size ?? 500),
        hasCellPhone: 'true',
        excludeIds: (dto.excludeIds ?? []) as string[],
      }

      try {
        const token = this.getValidS2SToken()
        const response = await lastValueFrom(
          this.httpService.post<PersonOutput[]>(
            `${PEOPLE_API_URL}/v1/people/sample`,
            body,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            },
          ),
        )
        return response.data
      } catch (error) {
        this.logger.error(
          { error },
          'Failed to sample contacts from people API',
        )
        throw new BadGatewayException(
          'Failed to sample contacts from people API',
        )
      }
    }

    return this.withOrgDistrictResolution(organization, fetchSample)
  }

  // Lookup a single person in the org's district by phone number.
  // The People API's list endpoint already accepts phone-shaped strings in
  // its `search` field and matches against the indexed
  // `VoterTelephones_CellPhoneFormatted` column. Returns the first match
  // (a phone may be shared by multiple voters in a household) or null.
  async findPersonByPhone(
    phone: string,
    organization: Organization,
  ): Promise<PersonOutput | null> {
    const result = await this.findContacts(
      { search: phone, segment: 'all', resultsPerPage: 1, page: 1 },
      organization,
    )
    return result.people[0] ?? null
  }

  async findPerson(
    id: string,
    organization: Organization,
  ): Promise<PersonOutput> {
    const fetchPerson = async (districtParams: { districtId: string }) => {
      try {
        const response = await lastValueFrom(
          this.httpService.get<PersonOutput>(
            `${PEOPLE_API_URL}/v1/people/${id}`,
            {
              headers: {
                Authorization: `Bearer ${this.getValidS2SToken()}`,
              },
              params: districtParams,
            },
          ),
        )

        return response.data
      } catch (error) {
        if (error instanceof HttpException) {
          throw error
        }
        this.logger.error(
          { data: JSON.stringify(error) },
          'Failed to fetch person from people API',
        )

        if (isAxiosError(error) && error.response?.status === 404) {
          throw new NotFoundException('Person not found')
        }

        throw new BadGatewayException('Failed to fetch person from people API')
      }
    }

    return this.withOrgDistrictResolution(organization, fetchPerson)
  }

  async downloadContacts(
    { segment }: DownloadContactsDTO,
    res: FastifyReply,
    organization: Organization,
  ) {
    if (!(await this.isProAccess(organization))) {
      throw new BadRequestException('Campaign is not pro')
    }

    const downloadPeople = async (
      districtParams: { districtId: string },
      filters: FilterObject,
    ) => {
      let response: { data: Readable }
      try {
        response = await lastValueFrom(
          this.httpService.post<Readable>(
            `${PEOPLE_API_URL}/v1/people/download`,
            { ...districtParams, filters },
            {
              headers: {
                Authorization: `Bearer ${this.getValidS2SToken()}`,
              },
              responseType: 'stream',
            },
          ),
        )
      } catch (error) {
        this.logger.error(
          { error },
          'Failed to download contacts from people API',
        )

        throw new BadGatewayException(
          'Failed to download contacts from people API',
        )
      }

      // Upstream is live. Only now do we commit our own response headers,
      // because once these are flushed the connection becomes a binary
      // download that any error response would corrupt (browser would save
      // the JSON error blob as `contacts.csv`). All earlier failures
      // (`isProAccess`, district resolution, axios POST) still produce a
      // structured 4xx/5xx because nothing has been written to the wire yet.
      res.raw.setHeader('Content-Type', 'text/csv')
      res.raw.setHeader(
        'Content-Disposition',
        'attachment; filename="contacts.csv"',
      )
      // Cookie handshake the Download.tsx client polls for. The browser
      // commits cookies from a download response, so its appearance is the
      // signal that "the server has actually started streaming" and lets the
      // client clear its preparing-state spinner ahead of the 15s fallback.
      // `Secure` is fine for localhost too: Chrome/Firefox/Safari all treat
      // localhost as a secure context for cookie purposes.
      res.raw.setHeader(
        'Set-Cookie',
        `gp_download=${randomUUID()}; Path=/; Max-Age=30; SameSite=Lax; Secure`,
      )
      if (!res.raw.headersSent) {
        res.raw.flushHeaders()
      }

      return new Promise<void>((resolve) => {
        let settled = false
        const settle = (fn: () => void) => {
          if (settled) return
          settled = true
          fn()
        }
        const destroyUpstream = () => {
          if (!response.data.destroyed) {
            response.data.destroy()
          }
        }

        response.data.pipe(res.raw)
        response.data.on('end', () => settle(resolve))
        // Once `flushHeaders()` above committed our HTTP headers to the wire,
        // a mid-transfer upstream error must NOT propagate as a rejection.
        // Nest's global exception filter would call
        // `httpAdapter.reply(res.raw, jsonBody, 500)` on a response whose
        // headers are already sent, producing either an
        // `ERR_HTTP_HEADERS_SENT` warning or a corrupt CSV+JSON blob saved as
        // `contacts.csv`. Instead: log, tear down both ends, and resolve so
        // the controller's await falls through cleanly. The browser sees a
        // truncated download and the operator sees the cause in the logs.
        response.data.on('error', (err: Error) =>
          settle(() => {
            this.logger.error(
              { err },
              'Upstream stream error after download headers committed',
            )
            destroyUpstream()
            if (!res.raw.destroyed) {
              res.raw.destroy(err)
            }
            resolve()
          }),
        )
        // Browser canceled / network closed mid-download: tear down the
        // upstream people-api stream so the gp-api → people-api socket and
        // the underlying pg COPY connection are released promptly instead of
        // waiting for an idle-timeout.
        res.raw.on('close', () =>
          settle(() => {
            destroyUpstream()
            resolve()
          }),
        )
      })
    }

    const filters = await this.segmentToFilters(segment, organization)
    return this.withOrgDistrictResolution(organization, (params) =>
      downloadPeople(params, filters),
    )
  }

  async getDistrictStats(organization: Organization) {
    return this.withOrgDistrictResolution(organization, ({ districtId }) =>
      this.fetchStatsByDistrictId(districtId),
    )
  }

  async resolveDistrictIdFromPosition(
    ballotReadyPositionId: string,
  ): Promise<string | undefined> {
    const position = await this.elections.getPositionByBallotReadyId(
      ballotReadyPositionId,
      { includeDistrict: true },
    )
    return position?.district?.id ?? undefined
  }

  async fetchStatsByDistrictId(districtId: string): Promise<StatsResponse> {
    const token = this.getValidS2SToken()

    try {
      const response = await lastValueFrom(
        this.httpService.get<StatsResponse>(
          `${PEOPLE_API_URL}/v1/people/stats`,
          {
            headers: { Authorization: `Bearer ${token}` },
            params: { districtId },
          },
        ),
      )

      return response.data
    } catch (error) {
      this.logger.error(
        { error },
        'Failed to fetch district stats from people API',
      )
      throw new BadGatewayException(
        'Failed to fetch district stats from people API',
      )
    }
  }

  private getValidS2SToken(): string {
    if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
      return this.cachedToken
    }

    return this.generateAndCacheS2SToken()
  }

  private isTokenValid(token: string): boolean {
    try {
      // jwt.decode returns string | JwtPayload | null — runtime shape depends on token contents
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      const decoded = jwt.decode(token) as { exp?: number }
      if (!decoded || !decoded.exp) {
        return false
      }

      const now = Math.floor(Date.now() / 1000)
      const bufferTime = 60

      return decoded.exp > now + bufferTime
    } catch {
      return false
    }
  }

  private generateAndCacheS2SToken(): string {
    const now = Math.floor(Date.now() / 1000)

    const payload = {
      iss: 'gp-api',
      iat: now,
      exp: now + 300,
    }

    this.cachedToken = jwt.sign(payload, PEOPLE_API_S2S_SECRET!)

    return this.cachedToken
  }

  private async segmentToFilters(
    segment: string | undefined,
    organization: Organization,
  ): Promise<FilterObject> {
    const resolvedSegment = segment || 'all'
    const builtInFilters = this.resolveBuiltInSegment(resolvedSegment)
    if (builtInFilters) return builtInFilters

    const customSegment =
      await this.voterFileFilterService.findByIdAndOrganizationSlug(
        parseInt(resolvedSegment),
        organization.slug,
      )

    return customSegment ? convertVoterFileFilterToFilters(customSegment) : {}
  }

  private resolveBuiltInSegment(segment: string): FilterObject | undefined {
    const segmentToFiltersMap =
      defaultSegmentToFiltersMap[
        // Dynamic key lookup into const object — TypeScript cannot narrow string to known keys
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        segment as keyof typeof defaultSegmentToFiltersMap
      ]

    if (!segmentToFiltersMap) return undefined

    const filters: Record<string, boolean> = {}
    for (const filterName of segmentToFiltersMap.filters) {
      filters[filterName] = true
    }
    return filters
  }
}
