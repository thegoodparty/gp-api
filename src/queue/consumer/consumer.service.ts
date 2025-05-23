import { Injectable, Logger } from '@nestjs/common'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { Message } from '@aws-sdk/client-sqs'
import { GenerateAiContentMessage, QueueMessage } from '../queue.types'
import { AiContentService } from 'src/campaigns/ai/content/aiContent.service'
import { SlackService } from 'src/shared/services/slack.service'
import { Campaign, PathToVictory, User } from '@prisma/client'
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

@Injectable()
export class ConsumerService {
  private readonly logger = new Logger(ConsumerService.name)

  constructor(
    private readonly aiContentService: AiContentService,
    private readonly slackService: SlackService,
    private readonly pathToVictoryService: PathToVictoryService,
    private readonly viabilityService: ViabilityService,
    private readonly analytics: AnalyticsService,
    private readonly campaignsService: CampaignsService,
  ) {}

  @SqsMessageHandler(process.env.SQS_QUEUE || '', false)
  async handleMessage(message: Message) {
    const shouldRequeue = await this.handleMessageAndMaybeRequeue(message)
    // Return a rejected promise if requeue is needed without throwing an error
    if (shouldRequeue) {
      return Promise.reject('Requeuing message without stopping the process')
    }
    return true // Return true to delete the message from the queue
  }

  // Function to process message and decide if requeue is necessary
  async handleMessageAndMaybeRequeue(message: Message): Promise<boolean> {
    try {
      await this.processMessage(message)
      return false // No requeue needed
    } catch (error) {
      this.logger.error('Message processing failed, will requeue:', error)
      return true // Indicate that we should requeue
    }
  }

  async processMessage(message: Message) {
    // console.log(`consumer received message: ${message.Body}`);
    if (!message) {
      return
    }
    const body = message.Body
    if (!body) {
      return
    }
    const queueMessage: QueueMessage = JSON.parse(body)
    this.logger.log('processing queue message type ', queueMessage.type)

    switch (queueMessage.type) {
      case 'generateAiContent':
        this.logger.log('received generateAiContent message')
        const generateAiContentMessage =
          queueMessage.data as GenerateAiContentMessage
        await this.aiContentService.handleGenerateAiContent(
          generateAiContentMessage,
        )

        const campaign = await this.campaignsService.findUniqueOrThrow({
          where: { slug: generateAiContentMessage.slug },
          include: { user: true },
        })

        this.analytics.trackEvent(
          campaign.user as User,
          'Content Builder: Generation Completed',
          {
            slug: generateAiContentMessage.slug,
            key: generateAiContentMessage.key,
            regenerate: generateAiContentMessage.regenerate,
          },
        )
        break
      case 'pathToVictory':
        this.logger.log('received pathToVictory message')
        const pathToVictoryMessage = queueMessage.data as PathToVictoryInput
        await this.handlePathToVictoryMessage(pathToVictoryMessage)
        break
    }
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
          officeName: p2vResponse.officeName || '',
          electionDate: p2vResponse.electionDate || '',
          electionTerm: p2vResponse.electionTerm || 0,
          electionLevel: p2vResponse.electionLevel || '',
          electionState: p2vResponse.electionState || '',
          electionCounty: p2vResponse.electionCounty || '',
          electionMunicipality: p2vResponse.electionMunicipality || '',
          subAreaName: p2vResponse.subAreaName,
          subAreaValue: p2vResponse.subAreaValue,
          partisanType: p2vResponse.partisanType || '',
          priorElectionDates: p2vResponse.priorElectionDates || [],
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
