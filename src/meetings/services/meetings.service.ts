import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Organization } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { z } from 'zod'
import { ElectedOfficeService } from '@/electedOffice/services/electedOffice.service'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { QueueProducerService } from '@/queue/producer/queueProducer.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { BriefingSchema } from '../types/briefing.schema'
import { BriefingListItem } from '../types/briefing.types'
import { extractBodyFromPositionName } from '../util/extractBodyFromPositionName.util'

const MEETING_PIPELINE_BUCKET =
  process.env.MEETING_PIPELINE_BUCKET ?? 'meeting-pipeline-dev'
const OUTPUT_PREFIX = 'meeting_pipeline/output'
const SOURCES_PREFIX = 'meeting_pipeline/sources'

export type MeetingBriefingsOnboardingPreview = {
  citySlug: string
  city: string
  state: string
  expectedBody: string
}

export type OnboardElectedOfficeResult = {
  citySlug: string
  manifestKey: string
  expectedBody: string
}

@Injectable()
export class MeetingsService {
  /* eslint-disable max-params -- onboarding needs S3, org, elected office, queue, logger */
  constructor(
    private readonly s3Service: S3Service,
    private readonly organizationsService: OrganizationsService,
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly queueProducerService: QueueProducerService,
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
   * Preview manifest fields for admin onboarding (no S3 / SQS writes).
   */
  async getOnboardingPreview(
    electedOfficeId: string,
  ): Promise<MeetingBriefingsOnboardingPreview> {
    const { parts, derivedExpectedBody } =
      await this.resolveOnboardingContext(electedOfficeId)
    return {
      citySlug: parts.citySlug,
      city: parts.city,
      state: parts.state,
      expectedBody: derivedExpectedBody,
    }
  }

  /**
   * Publish manifest.json to S3 and enqueue meeting-pipeline discover.
   */
  async onboardElectedOffice(
    electedOfficeId: string,
    input?: { expectedBody?: string },
  ): Promise<OnboardElectedOfficeResult> {
    const { parts, derivedExpectedBody } =
      await this.resolveOnboardingContext(electedOfficeId)

    const trimmedOverride = input?.expectedBody?.trim()
    const finalBody =
      trimmedOverride && trimmedOverride.length > 0
        ? trimmedOverride
        : derivedExpectedBody

    if (!finalBody?.trim()) {
      throw new UnprocessableEntityException(
        'expected_body is required after trimming.',
      )
    }

    const manifest = {
      city_slug: parts.citySlug,
      expected_city: parts.city,
      expected_state: parts.state,
      expected_body: finalBody,
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
        expectedBody: finalBody,
      },
      'Onboarded elected office to meeting briefings pipeline',
    )

    return {
      citySlug: parts.citySlug,
      manifestKey,
      expectedBody: finalBody,
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
