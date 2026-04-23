import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common'
import { Campaign } from '@prisma/client'
import { z } from 'zod'
import { PinoLogger } from 'nestjs-pino'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { campaignPlanQueueConfig } from 'src/queue/queue.config'
import { CampaignPlanCompleteMessage } from 'src/queue/queue.types'
import { isValid } from 'date-fns'
import {
  isDateTodayOrFuture,
  parseIsoDateString,
} from 'src/shared/util/date.util'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { GooglePlacesService } from '@/vendors/google/services/google-places.service'
import { extractCity } from '@/vendors/google/util/GooglePlaces.util'
import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

const LambdaEventTaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  cta: z.string(),
  flowType: z.nativeEnum(CampaignTaskType),
  week: z.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  url: z.string().optional(),
})

const LambdaResultPayloadSchema = z.object({
  campaignId: z.number(),
  tasks: z.array(LambdaEventTaskSchema),
  taskCount: z.number(),
  generationTimestamp: z.string(),
})

export type LambdaEventTask = z.infer<typeof LambdaEventTaskSchema>
export type LambdaResultPayload = z.infer<typeof LambdaResultPayloadSchema>

export type CampaignPlanLambdaPayload = {
  campaignId: number
  electionDate: string
  state: string | null
  city: string | null
  officeName: string | null
  officeLevel: string | null
  primaryElectionDate: string | null
}

@Injectable()
export class AiGenerationService {
  constructor(
    private readonly queueProducerService: QueueProducerService,
    private readonly s3Service: S3Service,
    private readonly organizationsService: OrganizationsService,
    private readonly googlePlacesService: GooglePlacesService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AiGenerationService.name)
  }

  async triggerGeneration(payload: CampaignPlanLambdaPayload): Promise<void> {
    if (
      !payload.electionDate ||
      !isValid(parseIsoDateString(payload.electionDate))
    ) {
      throw new BadRequestException(
        'electionDate must be a YYYY-MM-DD date string',
      )
    }
    if (
      payload.primaryElectionDate !== null &&
      !isValid(parseIsoDateString(payload.primaryElectionDate))
    ) {
      throw new BadRequestException(
        'primaryElectionDate must be a YYYY-MM-DD date string when provided',
      )
    }

    await this.queueProducerService.sendToCampaignPlanQueue(payload)
  }

  async triggerEventGeneration(campaign: Campaign): Promise<boolean> {
    const details = campaign.details ?? {}
    const { state, electionDate, ballotLevel, primaryElectionDate } = details

    if (!isDateTodayOrFuture(electionDate)) {
      this.logger.info(
        { campaignId: campaign.id, electionDate },
        'skipping event generation: election date missing or past',
      )
      return false
    }

    const [city, officeName] = await Promise.all([
      this.resolveCity(campaign),
      this.resolveOfficeName(campaign),
    ])

    const payload: CampaignPlanLambdaPayload = {
      campaignId: campaign.id,
      electionDate: electionDate ?? '',
      state: state ?? null,
      city,
      officeName,
      officeLevel: ballotLevel ?? null,
      primaryElectionDate: primaryElectionDate ?? null,
    }

    try {
      this.logger.info(
        { campaignId: campaign.id, payload },
        'triggering campaign plan Lambda generation',
      )
      await this.triggerGeneration(payload)
    } catch (error) {
      this.logger.warn(
        { campaignId: campaign.id, error },
        'failed to trigger event generation',
      )
      return false
    }

    return true
  }

  private async resolveCity(campaign: Campaign): Promise<string | null> {
    const detailsCity = campaign.details?.city
    if (typeof detailsCity === 'string' && detailsCity.trim() !== '') {
      return detailsCity
    }

    if (!campaign.placeId) return null

    try {
      const place = await this.googlePlacesService.getAddressByPlaceId(
        campaign.placeId,
      )
      return extractCity(place)?.long_name ?? null
    } catch (error) {
      this.logger.warn(
        { campaignId: campaign.id, placeId: campaign.placeId, error },
        'Google Places city fallback failed — sending null city',
      )
      return null
    }
  }

  private async resolveOfficeName(campaign: Campaign): Promise<string | null> {
    if (!campaign.organizationSlug) return null

    try {
      return await this.organizationsService.resolvePositionNameByOrganizationSlug(
        campaign.organizationSlug,
      )
    } catch (error) {
      this.logger.warn(
        { campaignId: campaign.id, error },
        'office name resolution failed — sending null officeName',
      )
      return null
    }
  }

  async readResultFromS3(s3Key: string): Promise<LambdaResultPayload> {
    const { resultsBucket } = campaignPlanQueueConfig
    if (!resultsBucket) {
      throw new BadGatewayException(
        'Campaign plan results bucket not configured',
      )
    }
    const fileContent = await this.s3Service.getFile(resultsBucket, s3Key)
    if (!fileContent) {
      throw new BadGatewayException('Campaign plan result not found in S3')
    }
    try {
      return LambdaResultPayloadSchema.parse(JSON.parse(fileContent))
    } catch (error) {
      this.logger.error(
        { s3Key, error },
        'failed to parse campaign plan payload from S3',
      )
      throw new BadGatewayException(
        'Failed to parse campaign plan result from S3',
      )
    }
  }

  async parseCompletionResult(
    data: Extract<CampaignPlanCompleteMessage, { status: 'completed' }>,
  ): Promise<{ campaignId: number; tasks: CampaignTask[] }> {
    const { campaignId, s3Key } = data

    const result = await this.readResultFromS3(s3Key)

    if (result.campaignId !== campaignId) {
      this.logger.warn(
        {
          sqsCampaignId: campaignId,
          s3CampaignId: result.campaignId,
          s3Key,
        },
        'campaign ID mismatch between SQS message and S3 payload',
      )
    }

    const tasks = this.parseLambdaResultToTasks(result, campaignId)
    return { campaignId, tasks }
  }

  parseLambdaResultToTasks(
    result: LambdaResultPayload,
    campaignId: number,
  ): CampaignTask[] {
    return result.tasks.map((task, index) => ({
      // SQS can deliever a message more than once. If the same message is delivered twice, we want a deterministic id.
      id: `event-${campaignId}-${index}-${result.generationTimestamp}`,
      title: task.title,
      description: task.description,
      cta: task.cta,
      flowType: task.flowType,
      week: task.week,
      date: task.date,
      link: task.url,
      proRequired: false,
    }))
  }
}
