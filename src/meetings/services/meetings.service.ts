import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Organization } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { z } from 'zod'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'
import { ElectionsService } from '@/elections/services/elections.service'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { QueueProducerService } from '@/queue/producer/queueProducer.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { PositionLevel } from 'src/generated/graphql.types'
import { BriefingSchema } from '../types/briefing.schema'
import { BriefingListItem } from '../types/briefing.types'
import { extractBodyFromPositionName } from '../util/extractBodyFromPositionName.util'

const MEETING_PIPELINE_BUCKET =
  process.env.MEETING_PIPELINE_BUCKET ?? 'meeting-pipeline-dev'
const OUTPUT_PREFIX = 'meeting_pipeline/output'
const SOURCES_PREFIX = 'meeting_pipeline/sources'

export type OnboardElectedOfficeResult = {
  citySlug: string
  manifestKey: string
  expectedBody: string
}

@Injectable()
export class MeetingsService {
  /* eslint-disable max-params -- onboarding needs S3, org, elected office, queue, elections, logger */
  constructor(
    private readonly s3Service: S3Service,
    private readonly organizationsService: OrganizationsService,
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly queueProducerService: QueueProducerService,
    private readonly electionsService: ElectionsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MeetingsService.name)
  }
  /* eslint-enable max-params */

  /**
   * Resolve the citySlug for the given organization.
   * Throws NotFoundException if the city cannot be determined.
   */
  async resolveCitySlug(org: Organization): Promise<string> {
    const citySlug = await this.organizationsService.resolveCitySlug(org)
    this.logger.info(
      { orgSlug: org.slug, positionId: org.positionId, citySlug },
      'Resolved city slug for meetings',
    )
    if (!citySlug) {
      throw new NotFoundException(
        'Could not determine city for this elected office. ' +
          'Ensure the position is configured correctly.',
      )
    }
    return citySlug
  }

  /**
   * List all available briefings for a city, most recent first.
   * Scans S3 for briefing JSON files matching the citySlug.
   */
  async listBriefings(org: Organization): Promise<BriefingListItem[]> {
    const citySlug = await this.resolveCitySlug(org)
    const prefix = `${OUTPUT_PREFIX}/briefings/${citySlug}_`

    this.logger.debug({ citySlug, prefix }, 'Listing briefings from S3')

    const keys = await this.s3Service.listKeys(MEETING_PIPELINE_BUCKET, prefix)

    this.logger.info(
      { citySlug, bucket: MEETING_PIPELINE_BUCKET, keyCount: keys.length },
      'Briefing S3 keys found',
    )

    const briefings: BriefingListItem[] = []
    for (const key of keys.sort().reverse()) {
      try {
        const raw = await this.s3Service.getFile(MEETING_PIPELINE_BUCKET, key)
        if (!raw) continue
        const briefing = BriefingSchema.parse(JSON.parse(raw) as unknown)
        briefings.push({
          citySlug: briefing.meeting.citySlug,
          cityName: briefing.meeting.cityName,
          state: briefing.meeting.state,
          date: briefing.meeting.date,
          title: briefing.meeting.title,
          readTime: briefing.meeting.readTime,
          priorityItemCount: briefing.executiveSummary.priorityItemCount,
          totalAgendaItems: briefing.executiveSummary.totalAgendaItems,
          executiveHeadline: briefing.executiveSummary.headline,
        })
      } catch (err) {
        this.logger.warn({ key, err }, 'Failed to parse briefing from S3')
      }
    }

    return briefings
  }

  /**
   * Get a single briefing by date for the official's city.
   */
  async getBriefing(
    org: Organization,
    date: string,
  ): Promise<z.infer<typeof BriefingSchema>> {
    const citySlug = await this.resolveCitySlug(org)
    const key = `${OUTPUT_PREFIX}/briefings/${citySlug}_${date}_briefing.json`

    this.logger.debug({ citySlug, date, key }, 'Fetching briefing from S3')

    const raw = await this.s3Service.getFile(MEETING_PIPELINE_BUCKET, key)
    if (!raw) {
      throw new NotFoundException(
        `No briefing found for ${citySlug} on ${date}`,
      )
    }

    return BriefingSchema.parse(JSON.parse(raw) as unknown)
  }

  /**
   * Onboard the elected office to the meeting briefings pipeline only if the
   * underlying position has `PositionLevel.CITY`. Intended to be called
   * fire-and-forget from the elected-office creation flow; never throws.
   */
  async triggerOnboardingIfCityLevel(electedOfficeId: string): Promise<void> {
    try {
      const orgSlug = OrganizationsService.electedOfficeOrgSlug(electedOfficeId)
      const org = await this.organizationsService.findUnique({
        where: { slug: orgSlug },
      })
      if (!org?.positionId) {
        this.logger.info(
          { electedOfficeId, orgSlug },
          'Skipping briefing onboarding: org missing positionId',
        )
        return
      }

      const position = await this.electionsService.getPositionById(
        org.positionId,
      )
      const positionLevel = position?.level ?? null
      if (!positionLevel) {
        this.logger.info(
          { electedOfficeId, positionId: org.positionId },
          'Skipping briefing onboarding: position has no level',
        )
        return
      }

      if (positionLevel !== PositionLevel.CITY) {
        this.logger.info(
          {
            electedOfficeId,
            positionId: org.positionId,
            level: positionLevel,
          },
          'Skipping briefing onboarding: position is not city-level',
        )
        return
      }

      await this.onboardElectedOffice(electedOfficeId)
    } catch (err) {
      this.logger.error(
        { err, electedOfficeId },
        'Briefing onboarding trigger failed',
      )
    }
  }

  /**
   * Publish manifest.json to S3 and enqueue meeting-pipeline discover.
   *
   * Called internally from `triggerOnboardingIfCityLevel` after the elected
   * office is created and the position is confirmed to be city-level. Not
   * exposed as an HTTP endpoint.
   */
  async onboardElectedOffice(
    electedOfficeId: string,
  ): Promise<OnboardElectedOfficeResult> {
    const { parts, derivedExpectedBody } =
      await this.resolveOnboardingContext(electedOfficeId)

    if (!derivedExpectedBody?.trim()) {
      throw new UnprocessableEntityException(
        'expected_body is required after trimming.',
      )
    }

    const manifest = {
      city_slug: parts.citySlug,
      expected_city: parts.city,
      expected_state: parts.state,
      expected_body: derivedExpectedBody,
      created_at: new Date().toISOString(),
    }

    const manifestKey = `${SOURCES_PREFIX}/${parts.citySlug}/manifest.json`
    const body = JSON.stringify(manifest, null, 2)

    await this.s3Service.uploadFile(
      MEETING_PIPELINE_BUCKET,
      body,
      manifestKey,
      { contentType: 'application/json' },
    )

    await this.queueProducerService.sendToMeetingPipelineDiscoverQueue({
      slug: parts.citySlug,
      city: parts.city,
      state: parts.state,
      reason: 'onboard',
    })

    this.logger.info(
      {
        electedOfficeId,
        citySlug: parts.citySlug,
        manifestKey,
        expectedBody: derivedExpectedBody,
      },
      'Onboarded elected office to meeting briefings pipeline',
    )

    return {
      citySlug: parts.citySlug,
      manifestKey,
      expectedBody: derivedExpectedBody,
    }
  }

  private async resolveOnboardingContext(electedOfficeId: string): Promise<{
    parts: { citySlug: string; city: string; state: string }
    derivedExpectedBody: string
  }> {
    const electedOffice = await this.electedOfficeService.findUnique({
      where: { id: electedOfficeId },
    })
    if (!electedOffice) {
      throw new NotFoundException('Elected office not found')
    }

    const orgSlug = OrganizationsService.electedOfficeOrgSlug(electedOfficeId)
    const org = await this.organizationsService.findUnique({
      where: { slug: orgSlug },
    })
    if (!org) {
      throw new NotFoundException('Elected office organization not found')
    }

    const parts = await this.organizationsService.resolveCityManifestParts(org)
    if (!parts) {
      throw new UnprocessableEntityException(
        'Could not resolve city for this elected office. Ensure position and district are configured.',
      )
    }

    const { positionName } =
      await this.organizationsService.resolvePositionContextByOrgSlug(org.slug)

    const derivedExpectedBody = extractBodyFromPositionName(positionName)

    return { parts, derivedExpectedBody }
  }
}
