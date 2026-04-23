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
import { isDateTodayOrFuture } from 'src/shared/util/date.util'
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

@Injectable()
export class AiGenerationService {
  constructor(
    private readonly queueProducerService: QueueProducerService,
    private readonly s3Service: S3Service,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AiGenerationService.name)
  }

  async triggerGeneration(params: {
    campaignId: number
    electionDate: string
    city: string
    state: string
  }): Promise<void> {
    if (!params.city || !params.state || !params.electionDate) {
      this.logger.error(
        {
          campaignId: params.campaignId,
          city: params.city,
          state: params.state,
          electionDate: params.electionDate,
        },
        'missing required fields for event generation',
      )
      throw new BadRequestException(
        'Missing required campaign fields for event generation',
      )
    }

    await this.queueProducerService.sendToCampaignPlanQueue({
      campaignId: params.campaignId,
      election_date: params.electionDate,
      city: params.city,
      state: params.state,
    })
  }

  async triggerEventGeneration(campaign: Campaign): Promise<boolean> {
    const { city, state, electionDate } = campaign.details ?? {}

    if (!isDateTodayOrFuture(electionDate)) {
      this.logger.info(
        { campaignId: campaign.id, electionDate },
        'skipping event generation: election date missing or past',
      )
      return false
    }

    try {
      await this.triggerGeneration({
        campaignId: campaign.id,
        electionDate: electionDate ?? '',
        city: city ?? '',
        state: state ?? '',
      })
    } catch (error) {
      this.logger.warn(
        { campaignId: campaign.id, error },
        'failed to trigger event generation',
      )
      return false
    }

    this.logger.info(
      { campaignId: campaign.id },
      'triggered campaign plan Lambda generation',
    )

    return true
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
