import { Injectable, Logger } from '@nestjs/common'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { Message } from '@aws-sdk/client-sqs'
import {
  GenerateAiContentMessageData,
  QueueMessage,
  QueueType,
  TcrComplianceStatusCheckMessage,
} from '../queue.types'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { AiContentService } from 'src/campaigns/ai/content/aiContent.service'
import { SlackService } from 'src/shared/services/slack.service'
import { Campaign, PathToVictory, TcrComplianceStatus } from '@prisma/client'
import { PathToVictoryService } from 'src/pathToVictory/services/pathToVictory.service'
import { SlackChannel } from 'src/shared/services/slackService.types'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { P2VResponse } from '../../pathToVictory/services/pathToVictory.service'
import {
  PathToVictoryInput,
  ViabilityScore,
} from 'src/pathToVictory/types/pathToVictory.types'
import { ViabilityService } from 'src/pathToVictory/services/viability.service'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { isAfter, parseISO } from 'date-fns'
import { CampaignTcrComplianceService } from '../../campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { QueueProducerService } from '../producer/queueProducer.service'
import { getTwelveHoursFromDate } from '../../shared/util/date.util'
import { EVENTS } from '../../segment/segment.types'

@Injectable()
export class QueueConsumerService {
  private readonly logger = new Logger(QueueConsumerService.name)

  constructor(
    private readonly aiContentService: AiContentService,
    private readonly slackService: SlackService,
    private readonly pathToVictoryService: PathToVictoryService,
    private readonly viabilityService: ViabilityService,
    private readonly analytics: AnalyticsService,
    private readonly campaignsService: CampaignsService,
    private readonly tcrComplianceService: CampaignTcrComplianceService,
    private readonly queueProducerService: QueueProducerService,
  ) {}

  @SqsMessageHandler(process.env.SQS_QUEUE || '', false)
  async handleMessage(message: Message) {
    const shouldRequeue = await this.handleMessageAndMaybeRequeue(message)

    return shouldRequeue
      ? // Return a rejected promise if requeue is needed without throwing an error
        Promise.reject('Requeuing message without stopping the process')
      : true // Return true to delete the message from the queue
  }

  // Function to process message and decide if requeue is necessary
  async handleMessageAndMaybeRequeue(message: Message): Promise<boolean> {
    try {
      this.logger.debug('Processing queue message: ', message)
      const success = await this.processMessage(message)
      return !success // Invert: true (success) becomes false (don't requeue)
    } catch (error) {
      const shouldRequeue = this.shouldRequeueError(error as Error)

      if (shouldRequeue) {
        this.logger.error('Message processing failed, will requeue:', error)
        this.logger.error('Messages to be requeued:', message)
        return true // Indicate that we should requeue
      } else {
        this.logger.error(
          'Message processing failed with non-retryable error, discarding message:',
          error,
        )

        this.logger.error('Message discarded:', message)

        // Send error notification to Slack for non-retryable errors
        try {
          await this.slackService.errorMessage({
            message: 'Queue message discarded due to non-retryable error',
            error: {
              error,
              message,
            },
          })
        } catch (slackError) {
          this.logger.error('Failed to send Slack notification:', slackError)
        }

        return true // Don't requeue, delete the message
      }
    }
  }

  private shouldRequeueError(error: Error): boolean {
    // Don't retry Prisma errors for missing records - these are permanent failures
    if (error instanceof PrismaClientKnownRequestError) {
      // P2025: Record not found
      if (error.code === 'P2025') {
        return false
      }
      // P2002: Unique constraint violation
      if (error.code === 'P2002') {
        return false
      }
    }

    // Don't retry validation errors or other client errors
    if (
      error.message.includes('validation') ||
      error.message.includes('Invalid')
    ) {
      return false
    }

    // Retry network errors, timeouts, and other temporary failures
    return true
  }

  // TODO: Each message type should be assigned it's own SQS queue allowing each
  //  module/service to listen to and handle it's own messages.  Or, in the very
  //  least, at _least_ delineate and abstract the message handling based on the
  //  MessageGroup for each message. However, that would be less desirable due
  //  to the requirement to still have a single queue consumer/poller.
  //
  //  This also limits us to using features that are only available for FIFO
  //  queues, complicating implementations. i.e. Long-polling semiphores are
  //  complicated since FIFO queues do not support the delaySeconds option field.
  //
  //  Furthermore, the message types here are not type-safe and could be
  //  misinterpreted by other modules/services.
  //
  //  https://goodparty.atlassian.net/browse/WEB-4518
  async processMessage(message: Message) {
    if (!message || !message.Body) {
      return true // Delete invalid messages from queue
    }

    const parsedBody = JSON.parse(message.Body) as QueueMessage
    const queueMessage: QueueMessage = parsedBody
    this.logger.log('processing queue message type ', queueMessage.type)

    switch (queueMessage.type) {
      case QueueType.GENERATE_AI_CONTENT:
        this.logger.log('received generateAiContent message')
        const generateAiContentMessage =
          queueMessage.data as GenerateAiContentMessageData

        try {
          await this.aiContentService.handleGenerateAiContent(
            generateAiContentMessage,
          )

          try {
            const { userId } = await this.campaignsService.findUniqueOrThrow({
              where: { slug: generateAiContentMessage.slug },
            })

            this.analytics.track(userId, EVENTS.AiContent.ContentGenerated, {
              slug: generateAiContentMessage.slug,
              key: generateAiContentMessage.key,
              regenerate: generateAiContentMessage.regenerate,
            })
          } catch (analyticsError) {
            this.logger.error(
              'Failed to track analytics for AI content:',
              analyticsError,
            )
          }
        } catch (error) {
          this.logger.error(
            `Error processing AI content generation for slug: ${generateAiContentMessage.slug}`,
            error,
          )
          throw error
        }
        break
      case QueueType.PATH_TO_VICTORY:
        this.logger.log('received pathToVictory message')
        const pathToVictoryMessage = queueMessage.data as PathToVictoryInput
        await this.handlePathToVictoryMessage(pathToVictoryMessage)
        break
      case QueueType.TCR_COMPLIANCE_STATUS_CHECK:
        this.logger.log('received tcrComplianceStatusCheck message')
        return await this.handleTcrComplianceCheckMessage(
          queueMessage.data as TcrComplianceStatusCheckMessage,
        )
    }
    // Return true to delete the message from the queue
    return true
  }

  // TODO: ALL of the below functions should be moved to their respective
  //  services. This is a queue consumer class. There should be no business
  //  logic in the queue consumer class. This GREATLY complicates development.
  private async handleTcrComplianceCheckMessage({
    processTime,
    peerlyIdentityId,
  }: TcrComplianceStatusCheckMessage) {
    const processDateTime = parseISO(processTime)
    const now = new Date()

    if (isAfter(processDateTime, now)) {
      this.logger.debug('Process time not yet reached. Re-queuing')
      return false // Requeue message - process time not reached yet
    }
    this.logger.debug('Process time met. Proceeding with processing')

    const status =
      await this.tcrComplianceService.checkTcrRegistrationStatus(
        peerlyIdentityId,
      )

    if (!status) {
      this.logger.debug(
        'TCR Registration still not active, re-queuing with delay',
      )
      await this.queueProducerService.sendMessage({
        type: QueueType.TCR_COMPLIANCE_STATUS_CHECK,
        data: {
          processTime: getTwelveHoursFromDate(processDateTime).toISOString(),
          peerlyIdentityId,
        },
      })
      // Delete the previous message from the queue since we can't just requeue w/ a `delaySeconds` option on a FIFO queue.
      return true
    }

    // Update the TCR compliance status to approved once the registration is active
    this.logger.debug(
      `TCR Registration is active, updating TCR compliance w/ identity ID ${peerlyIdentityId} status to approved`,
    )

    await this.tcrComplianceService.model.update({
      where: { peerlyIdentityId },
      data: {
        status: TcrComplianceStatus.approved,
      },
    })

    const { campaign } = await this.tcrComplianceService.findFirstOrThrow({
      include: {
        campaign: true,
      },
      where: { peerlyIdentityId },
    })

    const { userId } = campaign
    try {
      this.analytics.track(userId, EVENTS.Outreach.ComplianceCompleted)
      this.analytics.identify(userId, {
        '10DLC_compliant': true,
      })
    } catch (analyticsError) {
      this.logger.error(
        'Failed to track analytics for TCR compliance:',
        analyticsError,
      )
    }

    return true
  }

  private async handlePathToVictoryMessage(message: PathToVictoryInput) {
    let p2vSuccess = false
    let campaign: (Campaign & { pathToVictory: PathToVictory | null }) | null =
      null

    try {
      const p2vResponse: P2VResponse =
        await this.pathToVictoryService.handlePathToVictory({
          ...message,
        })
      this.logger.debug('p2vResponse', p2vResponse)

      campaign = await this.campaignsService.findUnique({
        where: { id: Number(message.campaignId) },
        include: { pathToVictory: true },
      })

      if (!campaign || campaign === null) {
        this.logger.error('campaign not found')
        throw new Error('campaign not found')
      }

      p2vSuccess = await this.pathToVictoryService.analyzePathToVictoryResponse(
        {
          campaign: campaign as Campaign & { pathToVictory: PathToVictory },
          pathToVictoryResponse: p2vResponse.pathToVictoryResponse,
          officeName: (p2vResponse.officeName as string) || '',
          electionDate: (p2vResponse.electionDate as string) || '',
          electionTerm: (p2vResponse.electionTerm as number) || 0,
          electionLevel: (p2vResponse.electionLevel as string) || '',
          electionState: (p2vResponse.electionState as string) || '',
          electionCounty: (p2vResponse.electionCounty as string) || '',
          electionMunicipality:
            (p2vResponse.electionMunicipality as string) || '',
          subAreaName: p2vResponse.subAreaName as string | undefined,
          subAreaValue: p2vResponse.subAreaValue as string | undefined,
          partisanType: (p2vResponse.partisanType as string) || '',
          priorElectionDates:
            (p2vResponse.priorElectionDates as string[]) || [],
        },
      )
    } catch (e) {
      this.logger.error('error in consumer/handlePathToVictoryMessage', e)
      await this.slackService.errorMessage({
        message: 'error in consumer/handlePathToVictoryMessage',
        error: e,
      })
    }

    if (p2vSuccess === false && campaign) {
      await this.handlePathToVictoryFailure(campaign)
      throw new Error('error in consumer/handlePathToVictoryMessage')
    }

    // Calculate viability score after a valid path to victory response
    let viability: ViabilityScore | null = null
    try {
      viability = await this.viabilityService.calculateViabilityScore(
        Number(message.campaignId),
      )
    } catch (e) {
      this.logger.error('error calculating viability score', e)
    }

    if (viability) {
      const pathToVictory = await this.pathToVictoryService.findUnique({
        where: { campaignId: Number(message.campaignId) },
      })

      if (pathToVictory) {
        const data = pathToVictory.data || {}
        await this.pathToVictoryService.update({
          where: { id: pathToVictory.id },
          data: {
            data: {
              ...data,
              viability,
            },
          },
        })
      }
      this.logger.debug('viability', viability)
      await this.slackService.message(
        {
          body: `Viability score calculated for ${campaign?.slug}: ${viability.score}`,
        },
        SlackChannel.botPathToVictory,
      )
    }

    return true

    // This is disabled until we have a process to load the data from the sheet
    // and a place to store the data since BallotCandidate was deprecated.
    // const isProd = WEBAPP_ROOT === 'https://goodparty.org'
    // // Send the candidate to google sheets for techspeed on production
    // if (isProd) {
    //   try {
    //     await this.crmService.techspeedAppendSheets(message.campaignId)
    //   } catch (e) {
    //     this.logger.error('error in techspeedAppendSheets', e)
    //     await this.slackService.errorMessage({
    //       message: 'error in techspeedAppendSheets',
    //       error: e,
    //     })
    //   }
    // }
  }

  private async handlePathToVictoryFailure(campaign: Campaign) {
    const p2v = await this.pathToVictoryService.findUniqueOrThrow({
      where: { campaignId: campaign.id },
    })

    let p2vAttempts = 0
    if (p2v.data.p2vAttempts) {
      p2vAttempts = p2v.data.p2vAttempts
    }
    p2vAttempts += 1

    if (p2vAttempts >= 3) {
      await this.slackService.message(
        {
          body: `Path To Victory has failed 3 times for ${campaign.slug}. Marking as failed`,
        },
        SlackChannel.botPathToVictoryIssues,
      )

      // mark the p2vStatus as Failed
      await this.pathToVictoryService.update({
        where: { id: p2v.id },
        data: {
          data: {
            ...p2v.data,
            p2vAttempts,
            p2vStatus: P2VStatus.failed,
          },
        },
      })
    } else {
      // otherwise, increment the p2vAttempts
      await this.pathToVictoryService.update({
        where: { id: p2v.id },
        data: {
          data: {
            ...p2v.data,
            p2vAttempts,
          },
        },
      })
    }
  }
}
