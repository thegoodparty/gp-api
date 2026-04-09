import { Injectable, NotFoundException } from '@nestjs/common'
import { Organization } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { z } from 'zod'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { BriefingSchema } from '../types/briefing.schema'
import { BriefingListItem } from '../types/briefing.types'

const MEETING_PIPELINE_BUCKET =
  process.env.MEETING_PIPELINE_BUCKET ?? 'meeting-pipeline-dev'
const OUTPUT_PREFIX = 'meeting_pipeline/output'

@Injectable()
export class MeetingsService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly organizationsService: OrganizationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MeetingsService.name)
  }

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
}
