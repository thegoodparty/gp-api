import { APIPollStatus, derivePollStatus } from '@/polls/polls.types'
import { Message } from '@aws-sdk/client-sqs'
import {
  BadGatewayException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import {
  Campaign,
  PathToVictory,
  Poll,
  PollIndividualMessageSender,
  Prisma,
  TcrComplianceStatus,
} from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { SqsMessageHandler } from '@ssut/nestjs-sqs'
import { isAxiosError } from 'axios'
import { format, isBefore } from 'date-fns'
import { groupBy } from 'es-toolkit'
import { formatInTimeZone } from 'date-fns-tz'
import parseCsv from 'neat-csv'
import { serializeError } from 'serialize-error'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { AiContentService } from 'src/campaigns/ai/content/aiContent.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { PersonOutput } from 'src/contacts/schemas/person.schema'
import { SampleContacts } from 'src/contacts/schemas/sampleContacts.schema'
import { ContactsService } from 'src/contacts/services/contacts.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { P2VStatus } from 'src/elections/types/pathToVictory.types'
import { recordCustomEvent } from 'src/observability/newrelic/newrelic.client'
import { CustomEventType } from 'src/observability/newrelic/newrelic.events'
import { PathToVictoryService } from 'src/pathToVictory/services/pathToVictory.service'
import { PathToVictoryInput } from 'src/pathToVictory/types/pathToVictory.types'
import { PollIssuesService } from 'src/polls/services/pollIssues.service'
import { PollsService } from 'src/polls/services/polls.service'
import {
  POLL_INDIVIDUAL_MESSAGE_NAMESPACE,
  sendTevynAPIPollMessage,
} from 'src/polls/utils/polls.utils'
import { UsersService } from 'src/users/services/users.service'
import { S3Service } from 'src/vendors/aws/services/s3.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { SlackChannel } from 'src/vendors/slack/slackService.types'
import { CampaignTcrComplianceService } from '../../campaigns/tcrCompliance/services/campaignTcrCompliance.service'
import { P2VResponse } from '../../pathToVictory/services/pathToVictory.service'
import { isNestJsHttpException } from '../../shared/util/http.util'
import { normalizePhoneNumber } from '../../shared/util/strings.util'
import { ForwardEmailDomainResponse } from '../../vendors/forwardEmail/forwardEmail.types'
import { PeerlyCvVerificationStatus } from '../../vendors/peerly/peerly.types'
import { EVENTS } from '../../vendors/segment/segment.types'
import { DomainsService } from '../../websites/services/domains.service'
import {
  DomainEmailForwardingMessage,
  GenerateAiContentMessageData,
  PollAnalysisCompleteEvent,
  PollAnalysisCompleteEventSchema,
  PollCreationEvent,
  PollCreationEventSchema,
  PollExpansionEvent,
  PollExpansionEventSchema,
  PollClusterAnalysisJsonSchema,
  QueueMessage,
  QueueType,
  TcrComplianceStatusCheckMessage,
} from '../queue.types'
import { PollIndividualMessageService } from '@/polls/services/pollIndividualMessage.service'
import { v5 as uuidv5 } from 'uuid'

type PollAnalysisIssue = PollAnalysisCompleteEvent['data']['issues'][number]

const buildIssueProperties = (
  issue: PollAnalysisIssue | undefined,
  index: number,
): Record<string, string | number | null> => {
  if (!issue) {
    return {
      [`issue${index}Description`]: null,
      [`issue${index}Quote1`]: null,
      [`issue${index}Quote2`]: null,
      [`issue${index}Quote3`]: null,
      [`issue${index}MentionCount`]: null,
    }
  }
  return {
    [`issue${index}Description`]: issue.summary,
    [`issue${index}Quote1`]: issue.quotes[0]?.quote ?? '',
    [`issue${index}Quote2`]: issue.quotes[1]?.quote ?? '',
    [`issue${index}Quote3`]: issue.quotes[2]?.quote ?? '',
    [`issue${index}MentionCount`]: issue.responseCount,
  }
}

@Injectable()
export class QueueConsumerService {
  private readonly logger = new Logger(QueueConsumerService.name)

  constructor(
    private readonly aiContentService: AiContentService,
    private readonly slackService: SlackService,
    private readonly pathToVictoryService: PathToVictoryService,
    private readonly analytics: AnalyticsService,
    private readonly campaignsService: CampaignsService,
    private readonly tcrComplianceService: CampaignTcrComplianceService,
    private readonly domainsService: DomainsService,
    private readonly pollsService: PollsService,
    private readonly pollIssuesService: PollIssuesService,
    private readonly pollIndividualMessage: PollIndividualMessageService,
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly contactsService: ContactsService,
    private readonly s3Service: S3Service,
    private readonly usersService: UsersService,
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
      this.logger.error(
        JSON.stringify({
          message,
          error: serializeError(error),
          msg: 'Message processing failed, will requeue',
        }),
      )
      return true // Indicate that we should requeue
    }
  }

  private legacyShouldRequeueError(error: Error): boolean {
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

  private withLegacyErrorSwallowing = async (
    message: Message,
    fn: () => Promise<boolean>,
  ) => {
    try {
      return await fn()
    } catch (error) {
      const shouldRequeue = this.legacyShouldRequeueError(error as Error)
      if (shouldRequeue) {
        return false // Requeue the message
      }

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

      return true // Don't requeue, delete the message
    }
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
        return await this.withLegacyErrorSwallowing(message, async () => {
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
          return true
        })
      case QueueType.PATH_TO_VICTORY:
        this.logger.log('received pathToVictory message')
        const pathToVictoryMessage = queueMessage.data as PathToVictoryInput
        return await this.withLegacyErrorSwallowing(message, async () => {
          await this.handlePathToVictoryMessage(pathToVictoryMessage)
          return true
        })
      case QueueType.TCR_COMPLIANCE_STATUS_CHECK:
        this.logger.log('received tcrComplianceStatusCheck message')
        return await this.withLegacyErrorSwallowing(message, () =>
          this.handleTcrComplianceCheckMessage(
            queueMessage.data as TcrComplianceStatusCheckMessage,
          ),
        )
      case QueueType.DOMAIN_EMAIL_FORWARDING:
        this.logger.log('received domainEmailForwarding message')
        return await this.withLegacyErrorSwallowing(message, () =>
          this.handleDomainEmailForwardingMessage(
            queueMessage.data as DomainEmailForwardingMessage,
          ),
        )
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

    const {
      slug,
      officeName,
      electionLevel,
      electionState,
      subAreaName,
      subAreaValue,
      electionDate,
    } = message

    try {
      this.logger.debug(
        `P2V start for slug=${slug}, office="${officeName}", level=${electionLevel}, state=${electionState}, subAreaName=${subAreaName}, subAreaValue=${subAreaValue}, electionDate=${electionDate}`,
      )
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
          positionId: p2vResponse.positionId as string | undefined,
        },
      )
    } catch (e) {
      this.logger.error(
        `error in consumer/handlePathToVictoryMessage for slug=${message.slug}, office="${message.officeName}"`,
        e,
      )
      // Extra structured context for visibility in logs
      this.logger.error('P2V context', {
        slug,
        officeName,
        electionLevel,
        electionState,
        subAreaName,
        subAreaValue,
        electionDate,
      })
      await this.slackService.errorMessage({
        message: 'error in consumer/handlePathToVictoryMessage',
        error: {
          error: e,
          context: {
            slug,
            officeName,
            electionLevel,
            electionState,
            subAreaName,
            subAreaValue,
            electionDate,
          },
        },
      })
    }

    if (p2vSuccess === false && campaign) {
      this.logger.error(
        `analyzePathToVictoryResponse returned false; slug=${campaign.slug}`,
      )
      const shouldRequeue = await this.handlePathToVictoryFailure(campaign)
      if (shouldRequeue) {
        throw new Error('error in consumer/handlePathToVictoryMessage')
      }
      // District already matched by gold flow. Don't requeue
    }

    return true
  }

  /**
   * Returns true if the message should be requeued for another attempt,
   * false if it should be deleted (no more retries needed).
   */
  private async handlePathToVictoryFailure(
    campaign: Campaign,
  ): Promise<boolean> {
    const p2v = await this.pathToVictoryService.findUniqueOrThrow({
      where: { campaignId: campaign.id },
    })

    let p2vAttempts = 0
    if (p2v.data.p2vAttempts) {
      p2vAttempts = p2v.data.p2vAttempts
    }
    p2vAttempts += 1

    const existingStatus = p2v.data.p2vStatus as string | undefined
    const isAlreadyMatched =
      existingStatus === P2VStatus.districtMatched ||
      existingStatus === P2VStatus.complete
    const exhaustedRetries = p2vAttempts >= 3
    const markAsFailed = exhaustedRetries && !isAlreadyMatched

    if (exhaustedRetries && isAlreadyMatched) {
      this.logger.log(
        `P2V silver flow exhausted retries for ${campaign.slug}, but gold flow already set status=${existingStatus}. Keeping existing status.`,
      )
    }

    if (markAsFailed) {
      await this.slackService.message(
        {
          body: `Path To Victory has failed 3 times for ${campaign.slug}. Marking as failed`,
        },
        SlackChannel.botPathToVictoryIssues,
      )
      recordCustomEvent(CustomEventType.BlockedState, {
        service: 'gp-api',
        environment: process.env.NODE_ENV,
        userId: campaign.userId,
        campaignId: campaign.id,
        slug: campaign.slug,
        feature: 'path_to_victory',
        rootCause: 'p2v_failed',
        isBackground: true,
        p2vAttempts,
      })
    }

    const updateData = {
      ...p2v.data,
      p2vAttempts,
      ...(markAsFailed ? { p2vStatus: P2VStatus.failed } : {}),
    }
    await this.pathToVictoryService.update({
      where: { id: p2v.id },
      data: { data: updateData },
    })

    return !exhaustedRetries
  }

  private async handlePollAnalysisComplete(event: PollAnalysisCompleteEvent) {
    const { pollId, totalResponses, responsesLocation, issues } = event.data
    this.logger.log(`Handling poll analysis complete event for poll ${pollId}`)
    const data = await this.getPollAndCampaign(pollId)
    if (!data) {
      this.logger.log('Poll not found, ignoring event')
      return
    }
    const { poll, campaign } = data
    const { electedOfficeId } = poll
    const { userId: campaignUserId, pathToVictory } = campaign

    if (!electedOfficeId) {
      throw new InternalServerErrorException(
        `Error: pollId ${pollId} has no elected office`,
      )
    }

    // We want to allow completing scheduled polls for testing purposes. In E2E tests
    // we create polls and want to simulate completing them quickly.
    if (
      ![APIPollStatus.SCHEDULED, APIPollStatus.IN_PROGRESS].includes(
        derivePollStatus(poll),
      )
    ) {
      this.logger.log('Poll is not in expected state, ignoring event', {
        poll,
      })
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
        totalResponses > 75 ||
        totalResponses / constituency.pagination.totalResults >= 0.1
    }

    await this.pollIssuesService.model.deleteMany({
      where: { pollId },
    })
    this.logger.log('Successfully deleted existing poll issues')

    const issuesToWrite = issues.map((issue) => ({
      id: `${pollId}-${issue.rank}`,
      pollId,
      title: issue.theme,
      summary: issue.summary,
      details: issue.analysis,
      mentionCount: issue.responseCount,
      representativeComments: issue.quotes.map((quote) => ({
        quote: quote.quote,
      })),
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
    await this.pollIssuesService.client.pollIssue.createMany({
      data: issuesToWrite,
    })
    this.logger.log('Successfully created new poll issues')
    const bucket = process.env.SERVE_ANALYSIS_BUCKET_NAME
    if (!bucket) {
      throw new Error('Please set SERVE_ANALYSIS_BUCKET_NAME in your .env')
    }
    const responsesFileContent = await this.s3Service.getFile(
      bucket,
      responsesLocation,
    )
    if (!responsesFileContent) {
      throw new InternalServerErrorException(
        `Unable to fetch responses from S3 for pollId: ${pollId}`,
      )
    }
    const rows = PollClusterAnalysisJsonSchema.parse(
      JSON.parse(responsesFileContent),
    )
    // One response can span multiple rows / elements in the array (one per atomic message)
    // and there may be duplicate rows
    const groups = groupBy(
      rows,
      (r) => `${r.phoneNumber}\n${r.receivedAt ?? ''}`,
    )

    const phoneNumbers = Array.from(
      new Set(rows.map((r) => normalizePhoneNumber(r.phoneNumber))),
    )
    const phoneToPersonIdMap = await this.findMappedPersonIdsForCellPhones({
      electedOfficeId,
      pollId,
      phoneNumbers,
    })

    const scalarData: Prisma.PollIndividualMessageCreateManyInput[] = []
    const joinValues: Prisma.Sql[] = []

    for (const [, groupRows] of Object.entries(groups)) {
      const first = groupRows[0]
      const { phoneNumber, originalMessage, receivedAt } = first
      const isOptOut = groupRows.some((r) => Boolean(r.isOptOut))
      const hasClusterId = groupRows.some(
        (r) => r.clusterId !== '' && r.clusterId != null,
      )

      // Discard responses that have no cluster assignment, unless they are opt-outs
      if (!hasClusterId && !isOptOut) continue

      const normalizedPhone = normalizePhoneNumber(phoneNumber)
      const personId = phoneToPersonIdMap.get(normalizedPhone)
      if (!personId) {
        throw new InternalServerErrorException(
          `Person with cell phone ${phoneNumber} not found in poll ${pollId}`,
        )
      }

      const uuid = uuidv5(
        `${pollId}-${personId}-${receivedAt}`,
        POLL_INDIVIDUAL_MESSAGE_NAMESPACE,
      )
      const sentAt = receivedAt ? new Date(receivedAt) : new Date()

      scalarData.push({
        id: uuid,
        personId,
        personCellPhone: normalizedPhone,
        sentAt,
        isOptOut,
        sender: PollIndividualMessageSender.CONSTITUENT,
        content: originalMessage,
        electedOfficeId,
        pollId,
      })

      // Only link to poll issues that exist in the event data (i.e. the top 3 clusters).
      // Multiple responses can also have the same cluster
      // Responses with a clusterId outside the top 3 still get saved above, just without a link.
      const linkedIssues = issuesToWrite.filter((issue) =>
        groupRows.some((row) => row.theme === issue.title),
      )
      for (const issue of linkedIssues) {
        joinValues.push(Prisma.sql`(${uuid}, ${issue.id})`)
      }
    }

    // Idempotency: delete constituent responses we're about to replace (same deterministic ids).
    // Does not touch ELECTED_OFFICIAL messages (outreach); join rows removed by FK CASCADE.
    const idsToReplace = scalarData.map((d) => d.id)
    const prisma = this.pollIndividualMessage.client
    await prisma.$transaction(
      async (tx) => {
        await tx.pollIndividualMessage.deleteMany({
          where: {
            id: { in: idsToReplace },
            pollId,
            sender: PollIndividualMessageSender.CONSTITUENT,
          },
        })
        await tx.pollIndividualMessage.createMany({ data: scalarData })
        if (joinValues.length > 0) {
          await tx.$executeRaw`
          INSERT INTO "_PollIndividualMessageToPollIssue" ("A", "B")
          VALUES ${Prisma.join(joinValues, ', ')}
        `
        }
      },
      { timeout: 20000 },
    )

    this.logger.log(
      `Created individual messages for poll ${pollId} (linked issues: ${joinValues.length})`,
    )

    await this.pollsService.markPollComplete({
      pollId,
      totalResponses,
      confidence: highConfidence ? 'HIGH' : 'LOW',
    })

    const pollCount = await this.pollsService.model.count({
      where: {
        electedOfficeId,
        isCompleted: true,
      },
    })

    await Promise.all([
      this.analytics.identify(campaignUserId, { pollcount: pollCount }),
      this.analytics.track(
        campaignUserId,
        EVENTS.Polls.ResultsSynthesisCompleted,
        {
          pollId,
          path: `/dashboard/polls/${pollId}`,
          constituencyName: pathToVictory?.data.electionLocation,
          'issue 1': issues?.at(0)?.theme || null,
          'issue 2': issues?.at(1)?.theme || null,
          'issue 3': issues?.at(2)?.theme || null,
          ...buildIssueProperties(issues?.at(0), 1),
          ...buildIssueProperties(issues?.at(1), 2),
          ...buildIssueProperties(issues?.at(2), 3),
          pollsSent: poll.targetAudienceSize,
          pollResponses: totalResponses,
          pollResponseRate:
            totalResponses > 0
              ? `${((totalResponses / poll.targetAudienceSize) * 100).toFixed(1)}%`
              : '0%',
        },
      ),
    ])
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
            where: {
              pollId: poll.id,
              sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
            },
            select: { personId: true },
          })

        return {
          size: poll.targetAudienceSize - alreadySent.length,
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
      this.logger.log(`${params.pollId} Poll not found, ignoring event`)
      return
    }
    const { poll, campaign } = data

    const user = await this.usersService.findUnique({
      where: { id: campaign.userId },
    })
    this.logger.log(`${params.pollId} Fetched sample and user`)

    if (!user) {
      this.logger.log(`${params.pollId} User not found, ignoring event`)
      return
    }

    const bucket = process.env.TEVYN_POLL_CSVS_BUCKET
    if (!bucket) {
      throw new Error(
        `${params.pollId} TEVYN_POLL_CSVS_BUCKET environment variable is required`,
      )
    }
    // It's important that this filename be deterministic based on the particular poll "run".
    // That way, in the event of a failure and retry, we can safely re-use a previously generated CSV.
    // We use the estimated completion date here because it gets set when the poll expanded, and then
    // does not change.
    const fileName = `${poll.id}-${poll.estimatedCompletionDate.toISOString()}.csv`
    const key = this.s3Service.buildKey(undefined, fileName)

    // 1. Get or create the CSV file of a random sample of contacts.
    // We do get-or-create here so that the logic remains retry-safe in the event of a failure.
    let csv = await this.s3Service.getFile(bucket, key)

    if (!csv) {
      this.logger.log(
        `${params.pollId} No existing CSV found, generating new one`,
      )
      const sampleParams = await params.sampleParams(poll)
      this.logger.log(
        `${poll.id} Sampling contacts with params: ${JSON.stringify(sampleParams)}`,
      )
      const sample = await this.contactsService.sampleContacts(
        sampleParams,
        campaign,
      )
      this.logger.log(
        `${params.pollId} Generated sample of ${sample.length} contacts`,
      )
      csv = buildCsvFromContacts(sample)
      await this.s3Service.uploadFile(bucket, csv, key, {
        contentType: 'text/csv',
      })
    }

    const people = await parseCsv<{ id: string; cellPhone: string }>(csv)

    // 2. Create individual poll messages
    const now = new Date()
    await this.pollsService.client.$transaction(
      async (tx) => {
        for (const person of people) {
          const message: Prisma.PollIndividualMessageUncheckedCreateInput = {
            // It's important that this id be deterministic, so that we can safely re-upsert
            // a previous CSV.
            id: `${poll.id}-${person.id}`,
            pollId: poll.id,
            personId: person.id!,
            sentAt: now,
            personCellPhone: normalizePhoneNumber(person.cellPhone),
            electedOfficeId: poll.electedOfficeId,
          }
          await tx.pollIndividualMessage.upsert({
            where: { id: message.id },
            create: message,
            update: { sentAt: now },
          })
        }
      },
      { timeout: 10000 },
    )

    this.logger.log(`${params.pollId} Created individual poll messages`)

    // 3. Send CSV file to Slack for Tevyn
    await sendTevynAPIPollMessage(this.slackService.client, {
      message: poll.messageContent,
      pollId: poll.id,
      scheduledDate: isBefore(poll.scheduledDate, new Date())
        ? 'Now'
        : formatInTimeZone(poll.scheduledDate, 'America/New_York', 'PP p') +
          ' ET',
      csv: {
        fileContent: Buffer.from(csv),
        filename: `${user.email}-${format(poll.scheduledDate, 'yyyy-MM-dd')}.csv`,
      },
      imageUrl: poll.imageUrl || undefined,
      userInfo: {
        name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
        email: user.email,
        phone: user.phone || undefined,
      },
      isExpansion: params.isExpansion,
    })
    this.logger.log(`${params.pollId} Slack message sent`)

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
      this.logger.log('No campaign found, ignoring event')
      return
    }
    return { poll, office, campaign }
  }

  async findMappedPersonIdsForCellPhones(params: {
    electedOfficeId: string
    pollId: string
    phoneNumbers: string[]
  }) {
    const { electedOfficeId, pollId, phoneNumbers } = params
    const cellPhonesToPeopleIds: Map<string, string> = new Map()
    const messages = await this.pollIndividualMessage.findMany({
      where: {
        electedOfficeId,
        pollId,
        personCellPhone: { in: phoneNumbers },
        sender: PollIndividualMessageSender.ELECTED_OFFICIAL,
      },
    })
    for (const message of messages) {
      const { personCellPhone, personId } = message
      if (!personCellPhone) {
        throw new InternalServerErrorException(
          'Encountered unexpected message without a cellphone',
        )
      }
      cellPhonesToPeopleIds.set(normalizePhoneNumber(personCellPhone), personId)
    }
    return cellPhonesToPeopleIds
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
