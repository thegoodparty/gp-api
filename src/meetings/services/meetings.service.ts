import { Injectable, NotFoundException } from '@nestjs/common'
import { Organization } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { OrganizationsService } from 'src/organizations/services/organizations.service'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { z } from 'zod'
import { BriefingListItem } from '../types/briefing.types'
import { BriefingSchema } from '../types/briefing.schema'

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

    console.log(
      '----------------------------------------------------------------------------`',
    )
    console.log('citySlug', citySlug)
    console.log('prefix', prefix)
    console.log(
      '----------------------------------------------------------------------------',
    )
    this.logger.debug({ citySlug, prefix }, 'Listing briefings from S3')

    // S3Service.getFile doesn't support listing — use AWS SDK list directly
    // We load the combined normalized_meetings index to enumerate available dates,
    // then check which have briefings.
    const briefingsPrefix = `${OUTPUT_PREFIX}/briefings/`
    const keys = await this.listS3Keys(briefingsPrefix, `${citySlug}_`)

    this.logger.info(
      {
        citySlug,
        bucket: MEETING_PIPELINE_BUCKET,
        keyCount: keys.length,
        keys,
      },
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
   * List S3 keys under a prefix, filtered by an optional key prefix match.
   * Uses the AWS SDK directly since S3Service doesn't expose list operations.
   */
  private async listS3Keys(
    prefix: string,
    filterPrefix?: string,
  ): Promise<string[]> {
    const { ListObjectsV2Command, S3Client } = await import(
      '@aws-sdk/client-s3'
    )

    const client = new S3Client({
      region: process.env.AWS_REGION ?? 'us-west-2',
    })
    const keys: string[] = []
    let continuationToken: string | undefined

    do {
      const response = await client.send(
        new ListObjectsV2Command({
          Bucket: MEETING_PIPELINE_BUCKET,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      )

      for (const obj of response.Contents ?? []) {
        if (!obj.Key) continue
        const filename = obj.Key.split('/').pop() ?? ''
        if (!filterPrefix || filename.startsWith(filterPrefix)) {
          keys.push(obj.Key)
        }
      }

      continuationToken = response.NextContinuationToken
    } while (continuationToken)

    return keys
  }
}
