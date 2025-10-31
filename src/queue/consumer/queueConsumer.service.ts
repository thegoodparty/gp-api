import { BadGatewayException, Injectable, Logger } from '@nestjs/common'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { Message } from '@aws-sdk/client-sqs'
import {
  DomainEmailForwardingMessage,
  GenerateAiContentMessageData,
  PollAnalysisCompleteEvent,
  PollAnalysisCompleteEventSchema,
  PollCreationEvent,
  PollCreationEventSchema,
  PollExpansionEvent,
  PollExpansionEventSchema,
  PollIssueAnalysisEvent,
  PollIssueAnalysisEventSchema,
  QueueMessage,
  QueueType,
  TcrComplianceStatusCheckMessage,
} from '../queue.types'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { AiContentService } from 'src/campaigns/ai/content/aiContent.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import {
  Campaign,
  PathToVictory,
  Poll,
  PollIndividualMessage,
  PollIssue,
  TcrComplianceStatus,
} from '@prisma/client'
import { PathToVictoryService } from 'src/pathToVictory/services/pathToVictory.service'
import { SlackChannel } from 'src/vendors/slack/slackService.types'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { P2VResponse } from '../../pathToVictory/services/pathToVictory.service'
import {
  PathToVictoryInput,
  ViabilityScore,
} from 'src/pathToVictory/types/pathToVictory.types'
import { ViabilityService } from 'src/pathToVictory/services/viability.service'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { CampaignTcrComplianceService } from '../../campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { EVENTS } from '../../vendors/segment/segment.types'
import { DomainsService } from '../../websites/services/domains.service'
import { ForwardEmailDomainResponse } from '../../vendors/forwardEmail/forwardEmail.types'
import { PeerlyCvVerificationStatus } from '../../vendors/peerly/peerly.types'
import { isNestJsHttpException } from '../../shared/util/http.util'
import { isAxiosError } from 'axios'
import { PollsService } from 'src/polls/services/polls.service'
import { PollIssuesService } from 'src/polls/services/pollIssues.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { ContactsService } from 'src/contacts/services/contacts.service'
import { AwsS3Service } from 'src/vendors/aws/services/awsS3.service'
import { PersonOutput } from 'src/contacts/schemas/person.schema'
import { buildTevynApiSlackBlocks } from 'src/polls/utils/polls.utils'
import { UsersService } from 'src/users/services/users.service'
import { FeaturesService } from 'src/features/services/features.service'
import { SampleContacts } from 'src/contacts/schemas/sampleContacts.schema'
import parseCsv from 'neat-csv'

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
    private readonly domainsService: DomainsService,
    private readonly pollsService: PollsService,
    private readonly pollIssuesService: PollIssuesService,
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly contactsService: ContactsService,
    private readonly awsS3Service: AwsS3Service,
    private readonly usersService: UsersService,
    private readonly featuresService: FeaturesService,
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
        this.logger.error(`Message to be requeued: ${JSON.stringify(message)}`)
        return true // Indicate that we should requeue
      } else {
        this.logger.error(
          `Message processing failed with non-retryable error, discarding message: ${JSON.stringify(message)}`,
          error,
        )

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

        return false // Don't requeue, delete the message
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
    this.logger.log(`processing queue message type ${queueMessage.type}`)

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
      case QueueType.DOMAIN_EMAIL_FORWARDING:
        this.logger.log('received domainEmailForwarding message')
        return await this.handleDomainEmailForwardingMessage(
          queueMessage.data as DomainEmailForwardingMessage,
        )
      case QueueType.POLL_ISSUES_ANALYSIS:
        this.logger.log('received pollIssueAnalysis message')
        const pollIssueAnalysisEvent =
          PollIssueAnalysisEventSchema.parse(queueMessage)
        return await this.handlePollIssuesAnalysis(pollIssueAnalysisEvent)
      case QueueType.POLL_ANALYSIS_COMPLETE:
        this.logger.log('received pollAnalysisComplete message')
        const pollAnalysisCompleteEvent =
          PollAnalysisCompleteEventSchema.parse(queueMessage)
        return await this.handlePollAnalysisComplete(pollAnalysisCompleteEvent)
      case QueueType.POLL_CREATION:
        this.logger.log('received pollCreation message')
        const pollCreationEvent = PollCreationEventSchema.parse(queueMessage)
        return await this.handlePollCreation(
          pollCreationEvent,
          message.MessageId!,
        )
      case QueueType.POLL_EXPANSION:
        this.logger.log('received pollExpansion message')
        const pollExpansionEvent = PollExpansionEventSchema.parse(queueMessage)
        return await this.handlePollExpansion(
          pollExpansionEvent,
          message.MessageId!,
        )
    }
    // Return true to delete the message from the queue
    return true
  }

  private async getCvTokenStatus(
    peerlyIdentityId: string,
  ): Promise<PeerlyCvVerificationStatus | null> {
    let cvTokenStatus: PeerlyCvVerificationStatus | null = null
    try {
      cvTokenStatus =
        (await this.tcrComplianceService.getCvTokenStatus(peerlyIdentityId)) ||
        null
    } catch (e) {
      // TODO: We have to do all this error handling because of how Peerly is
      //  throwing `BadGatewayException` instead of just throwing the
      //  `AxiosError` that caused the problem in the first place. We should revisit
      //  this when we have more time: https://goodparty.clickup.com/t/86ac8y227
      if (
        isNestJsHttpException(e) &&
        e instanceof BadGatewayException &&
        isAxiosError(e.cause)
      ) {
        const requestError = e.cause
        const status = requestError.response?.status
        this.logger.warn(
          `HTTP exception occurred while fetching CV token status: ${status} - ${e.message}`,
          { peerlyIdentityId, status, response: e.getResponse() },
        )
        if (status && status === 404) {
          this.logger.debug(
            `Received 404 NOT FOUND. CV token has not been requested yet for identity ID ${peerlyIdentityId}`,
          )
        } else {
          // Something else went wrong
          this.logger.error(
            `HTTP exception occurred while fetching CV token status: ${status} - ${e.message}`,
            { peerlyIdentityId, status, response: e.getResponse() },
          )
          throw e.cause
        }
      } else {
        // Something else went wrong. Just throw the error.
        throw e
      }
    }
    return cvTokenStatus
  }

  // TODO: ALL of the below functions should be moved to their respective
  //  services. This is a queue consumer class. There should be no business
  //  logic in the queue consumer class. This GREATLY complicates development.
  private async handleTcrComplianceCheckMessage({
    tcrCompliance,
  }: TcrComplianceStatusCheckMessage) {
    const { peerlyIdentityId } = tcrCompliance
    if (!peerlyIdentityId) {
      this.logger.error(
        `No peerlyIdentityId found on TcrCompliance provided, skipping: ${JSON.stringify(tcrCompliance)}`,
      )
      return true // remove message from the queue
    }

    const { campaign } = await this.tcrComplianceService.findFirstOrThrow({
      include: {
        campaign: true,
      },
      where: { peerlyIdentityId },
    })
    const { userId } = campaign

    const cvTokenStatus = await this.getCvTokenStatus(peerlyIdentityId)

    cvTokenStatus &&
      (await this.analytics.track(
        userId,
        EVENTS.Outreach.CampaignVerifyTokenStatusUpdate,
        {
          cvTokenStatus,
        },
      ))

    const registrationStatus =
      await this.tcrComplianceService.checkTcrRegistrationStatus(
        peerlyIdentityId,
      )

    if (!registrationStatus) {
      this.logger.debug(
        `TCR Registration is not active at this time: ${JSON.stringify(tcrCompliance)}`,
      )
      return true // delete from the queue
    }

    this.logger.debug(
      `TCR Registration is active, updating TCR compliance w/ identity ID ${peerlyIdentityId} status to approved`,
    )

    await this.tcrComplianceService.model.update({
      where: { peerlyIdentityId },
      data: {
        status: TcrComplianceStatus.approved,
      },
    })

    try {
      await this.analytics.track(userId, EVENTS.Outreach.ComplianceCompleted)
      await this.analytics.identify(userId, {
        '10DLC_compliant': true,
      })
    } catch (analyticsError) {
      this.logger.error(
        `Failed to track analytics for TCR compliance: ${JSON.stringify(tcrCompliance)}`,
        analyticsError,
      )
    }

    return true
  }

  private async handleDomainEmailForwardingMessage({
    domainId,
    forwardingEmailAddress,
  }: DomainEmailForwardingMessage): Promise<boolean> {
    if (!this.domainsService.shouldEnableDomainPurchase()) {
      const message = `Domain purchasing is disabled - skipping backfill for domainId: ${domainId}`
      this.logger.debug(message)
      throw new Error(message, { cause: { domainId, forwardingEmailAddress } })
    }
    const domain = await this.domainsService.model.findUniqueOrThrow({
      where: { id: domainId },
    })

    let forwardEmailDomain: ForwardEmailDomainResponse | null = null
    try {
      forwardEmailDomain = await this.domainsService.setupDomainEmailForwarding(
        domain,
        forwardingEmailAddress,
      )
      this.logger.debug(
        `Email forwarding set up for domain *@${domain.name} -> ${forwardingEmailAddress}`,
      )
    } catch (e) {
      const message = `Error setting up email forwarding for domain *@${domain.name} -> ${forwardingEmailAddress}`
      this.logger.error(message)
      throw new Error(message, { cause: { domainId, forwardingEmailAddress } })
    }

    forwardEmailDomain &&
      (await this.domainsService.model.update({
        where: {
          id: domainId,
        },
        data: { emailForwardingDomainId: forwardEmailDomain.id },
      }))

    return true
  }

  private async handlePathToVictoryMessage(
    message: PathToVictoryInput,
  ): Promise<boolean> {
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

  private async handlePollIssuesAnalysis(event: PollIssueAnalysisEvent) {
    const issue: PollIssue = {
      id: `${event.data.pollId}-${event.data.rank}`,
      pollId: event.data.pollId,
      title: event.data.theme,
      summary: event.data.summary,
      details: event.data.analysis,
      mentionCount: event.data.responseCount,
      representativeComments: event.data.quotes.map((quote) => ({
        quote: quote.quote,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    const result = await this.pollIssuesService.model.upsert({
      where: { id: issue.id },
      create: issue,
      update: issue,
    })
    this.logger.log('Successfully upserted poll issue', result)
    return true
  }

  private async handlePollAnalysisComplete(event: PollAnalysisCompleteEvent) {
    const data = await this.getPollAndCampaign(event.data.pollId)
    if (!data) {
      this.logger.log('Poll not found, ignoring event')
      return
    }
    const { poll, campaign } = data

    if (poll.status !== 'IN_PROGRESS') {
      this.logger.log('Poll is not in-progress, ignoring event')
      return
    }

    const constituency = await this.contactsService.findContacts(
      { segment: 'all', resultsPerPage: 5, page: 1 },
      campaign,
    )

    let highConfidence = false
    if (constituency.pagination.totalResults) {
      // High confidence is EITHER:
      //  - 75 total responses
      //  - responses from >=10%
      // This was last decided here: https://goodparty.clickup.com/t/90132012119/ENG-4771
      highConfidence =
        event.data.totalResponses > 75 ||
        event.data.totalResponses / constituency.pagination.totalResults >= 0.1
    }

    await this.pollsService.markPollComplete({
      pollId: poll.id,
      totalResponses: event.data.totalResponses,
      confidence: highConfidence ? 'HIGH' : 'LOW',
    })
    if (campaign) {
      await this.analytics.track(
        campaign.userId,
        EVENTS.Polls.ResultsSynthesisCompleted,
        {
          pollId: poll.id,
          path: `/dashboard/polls/${poll.id}`,
          constituencyName: campaign.pathToVictory?.data.electionLocation,
        },
      )
    }
    return true
  }

  private async handlePollCreation(
    event: PollCreationEvent,
    messageId: string,
  ) {
    return this.triggerPollExecution({
      pollId: event.data.pollId,
      messageId,
      sampleParams: async (poll) => {
        return { size: poll.targetAudienceSize }
      },
      isExpansion: false,
    })
  }

  private async handlePollExpansion(
    event: PollExpansionEvent,
    messageId: string,
  ) {
    return this.triggerPollExecution({
      pollId: event.data.pollId,
      messageId,
      sampleParams: async (poll) => {
        const alreadySent =
          await this.pollsService.client.pollIndividualMessage.findMany({
            where: { pollId: poll.id },
            select: { personId: true },
          })

        return {
          size: poll.targetAudienceSize,
          excludeIds: alreadySent.map((p) => p.personId),
        }
      },
      isExpansion: true,
    })
  }

  private async triggerPollExecution(params: {
    pollId: string
    messageId: string
    sampleParams: (poll: Poll) => Promise<SampleContacts> | SampleContacts
    isExpansion: boolean
  }) {
    const data = await this.getPollAndCampaign(params.pollId)
    if (!data) {
      this.logger.log('Poll not found, ignoring event')
      return
    }
    const { poll, campaign } = data

    const user = await this.usersService.findUnique({
      where: { id: campaign.userId },
    })
    this.logger.log('Fetched sample and user')

    if (!user) {
      this.logger.log('User not found, ignoring event')
      return
    }

    const isExpansionEnabled = await this.featuresService.isFeatureEnabled({
      user,
      feature: 'serve-polls-expansion',
    })

    const bucket = 'tevyn-poll-csvs'
    // It's important that this filename be deterministic. That way, in the event of a failure
    // and retry, we can safely re-use a previously generated CSV.
    const fileName = `${poll.id}-${params.messageId}.csv`

    // 1. Get or create the CSV file of a random sample of contacts.
    // We do get-or-create here so that the logic remains retry-safe in the event of a failure.
    let csv = await this.awsS3Service.getFile({
      bucket,
      fileName,
    })

    if (!csv) {
      this.logger.log('No existing CSV found, generating new one')
      const sampleParams = await params.sampleParams(poll)
      const sample = await this.contactsService.sampleContacts(
        sampleParams,
        campaign,
      )
      csv = buildCsvFromContacts(sample)
      await this.awsS3Service.uploadFile(csv, bucket, fileName, 'text/csv')
    }

    const csvUrl = await this.awsS3Service.getSignedDownloadUrl({
      bucket,
      fileName,
    })
    const people = await parseCsv<{ id: string }>(csv)

    // 2. Create individual poll messages
    if (isExpansionEnabled) {
      const now = new Date()
      await this.pollsService.client.$transaction(async (tx) => {
        for (const person of people) {
          const message: PollIndividualMessage = {
            // It's important that this id be deterministic, so that we can safely re-upsert
            // a previous CSV.
            id: `${poll.id}-${person.id}`,
            pollId: poll.id,
            personId: person.id!,
            sentAt: now,
          }
          await tx.pollIndividualMessage.upsert({
            where: { id: message.id },
            create: message,
            update: message,
          })
        }
      })
    }

    this.logger.log('Created individual poll messages')

    // 3. Send CSV file to Slack for Tevyn
    const blocks = buildTevynApiSlackBlocks({
      message: poll.messageContent,
      pollId: poll.id,
      csvFileUrl: csvUrl,
      imageUrl: poll.imageUrl || undefined,
      userInfo: {
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        email: user.email,
        phone: user.phone || undefined,
      },
      isExpansion: params.isExpansion,
    })
    await this.slackService.message({ blocks }, SlackChannel.botTevynApi)
    this.logger.log('Slack message sent')

    return true
  }

  private async getPollAndCampaign(pollId: string) {
    const poll = await this.pollsService.findUnique({
      where: { id: pollId },
    })
    if (!poll) {
      this.logger.log('Poll not found, ignoring event')
      return
    }

    if (!poll.electedOfficeId) {
      this.logger.log('Poll has no elected office, ignoring event')
      return
    }

    const office = await this.electedOfficeService.findUnique({
      where: { id: poll.electedOfficeId },
    })

    if (!office) {
      this.logger.log('Elected office not found, ignoring event')
      return
    }

    const campaign = await this.campaignsService.findUnique({
      where: { id: office.campaignId },
      include: { pathToVictory: true },
    })

    if (!campaign) {
      this.logger.log('No campagin found, ignoring event')
      return
    }
    return { poll, office, campaign }
  }
}

const csvEscape = (value) => {
  if (value === null || value === undefined) return ''
  const str = String(value)
  const mustQuote = /[",\n]/.test(str)
  const escaped = str.replace(/"/g, '""')
  return mustQuote ? `"${escaped}"` : escaped
}

const buildCsvFromContacts = (people: PersonOutput[]) => {
  const headers: (keyof PersonOutput)[] = [
    'id',
    'firstName',
    'lastName',
    'cellPhone',
  ]
  const lines = [headers.join(',')]
  for (const person of people) {
    const row = headers.map((key) => csvEscape(person?.[key] ?? ''))
    lines.push(row.join(','))
  }
  return lines.join('\n')
}
