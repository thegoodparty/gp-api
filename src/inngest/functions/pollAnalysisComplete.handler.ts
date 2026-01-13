import { Injectable, Logger } from '@nestjs/common'
import { NonRetriableError } from 'inngest'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ContactsService } from 'src/contacts/services/contacts.service'
import { ElectedOfficeService } from 'src/electedOffice/services/electedOffice.service'
import { PollIssuesService } from 'src/polls/services/pollIssues.service'
import { PollsService } from 'src/polls/services/polls.service'
import { APIPollStatus, derivePollStatus } from 'src/polls/polls.types'
import { EVENTS } from 'src/vendors/segment/segment.types'

export type PollAnalysisCompleteData = {
  pollId: string
  totalResponses: number
  issues: Array<{
    pollId: string
    rank: number
    theme: string
    summary: string
    analysis: string
    responseCount: number
    quotes: Array<{ quote: string; phone_number: string }>
  }>
}

@Injectable()
export class PollAnalysisCompleteHandler {
  private readonly logger = new Logger(PollAnalysisCompleteHandler.name)

  constructor(
    private readonly pollsService: PollsService,
    private readonly pollIssuesService: PollIssuesService,
    private readonly contactsService: ContactsService,
    private readonly campaignsService: CampaignsService,
    private readonly electedOfficeService: ElectedOfficeService,
    private readonly analyticsService: AnalyticsService,
  ) {}

  async handle(event: PollAnalysisCompleteData) {
    const { pollId, totalResponses, issues } = event

    this.logger.log(
      `Handling poll analysis complete event for poll ${pollId}`,
    )

    // Step 1: Fetch poll and campaign
    const data = await this.getPollAndCampaign(pollId)
    if (!data) {
      this.logger.log('Poll not found, ignoring event')
      throw new NonRetriableError('Poll not found')
    }
    const { poll, campaign } = data

    // Step 2: Validate poll status
    if (derivePollStatus(poll) !== APIPollStatus.IN_PROGRESS) {
      this.logger.log('Poll is not in-progress, ignoring event', {
        poll,
      })
      throw new NonRetriableError('Poll is not in-progress')
    }

    // Step 3: Calculate confidence
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

    // Step 4: Delete existing poll issues
    await this.pollIssuesService.model.deleteMany({
      where: { pollId },
    })
    this.logger.log('Successfully deleted existing poll issues')

    // Step 5: Create new poll issues
    await this.pollIssuesService.client.pollIssue.createMany({
      data: issues.map((issue) => ({
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
      })),
    })
    this.logger.log('Successfully created new poll issues')

    // Step 6: Mark poll complete
    await this.pollsService.markPollComplete({
      pollId: poll.id,
      totalResponses,
      confidence: highConfidence ? 'HIGH' : 'LOW',
    })

    // Step 7: Track analytics
    const pollCount = await this.pollsService.model.count({
      where: {
        electedOfficeId: poll.electedOfficeId,
        isCompleted: true,
      },
    })

    await this.analyticsService.identify(campaign.userId, {
      pollcount: pollCount,
    })
    await this.analyticsService.track(
      campaign.userId,
      EVENTS.Polls.ResultsSynthesisCompleted,
      {
        pollId: poll.id,
        path: `/dashboard/polls/${poll.id}`,
        constituencyName: campaign.pathToVictory?.data.electionLocation,
        'issue 1': issues?.at(0)?.theme || null,
        'issue 2': issues?.at(1)?.theme || null,
        'issue 3': issues?.at(2)?.theme || null,
      },
    )

    return { success: true, pollId, highConfidence }
  }

  private async getPollAndCampaign(pollId: string) {
    const poll = await this.pollsService.findUnique({
      where: { id: pollId },
    })
    if (!poll) {
      return null
    }

    if (!poll.electedOfficeId) {
      this.logger.log('Poll has no elected office, ignoring event')
      return null
    }

    const office = await this.electedOfficeService.findUnique({
      where: { id: poll.electedOfficeId },
    })

    if (!office) {
      this.logger.log('Elected office not found, ignoring event')
      return null
    }

    const campaign = await this.campaignsService.findUnique({
      where: { id: office.campaignId },
      include: { pathToVictory: true },
    })

    if (!campaign) {
      this.logger.log('No campaign found, ignoring event')
      return null
    }

    return { poll, office, campaign }
  }
}
