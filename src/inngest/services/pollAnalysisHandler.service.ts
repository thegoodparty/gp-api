import { Injectable, Logger } from '@nestjs/common'
import { Campaign, PathToVictory, Poll } from '@prisma/client'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { ContactsService } from 'src/contacts/services/contacts.service'
import { PollIssuesService } from 'src/polls/services/pollIssues.service'
import { PollsService } from 'src/polls/services/polls.service'
import { APIPollStatus, derivePollStatus } from 'src/polls/polls.types'
import { EVENTS } from 'src/vendors/segment/segment.types'
import { PollAnalysisCompleteData } from '../inngest.client'

type CampaignWithPathToVictory = Campaign & {
  pathToVictory: PathToVictory | null
}

@Injectable()
export class PollAnalysisHandlerService {
  private readonly logger = new Logger(PollAnalysisHandlerService.name)

  constructor(
    private readonly pollsService: PollsService,
    private readonly pollIssuesService: PollIssuesService,
    private readonly campaignsService: CampaignsService,
    private readonly contactsService: ContactsService,
    private readonly analytics: AnalyticsService,
  ) {}

  async handlePollAnalysisComplete(data: PollAnalysisCompleteData) {
    this.logger.log(
      `Handling poll analysis complete event for poll ${data.pollId}`,
    )

    const pollData = await this.getPollAndCampaign(data.pollId)
    if (!pollData) {
      this.logger.log('Poll not found, ignoring event')
      return
    }
    const { poll, campaign } = pollData

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
      highConfidence =
        data.totalResponses > 75 ||
        data.totalResponses / constituency.pagination.totalResults >= 0.1
    }

    await this.pollIssuesService.model.deleteMany({
      where: { pollId: data.pollId },
    })
    this.logger.log('Successfully deleted existing poll issues')

    await this.pollIssuesService.client.pollIssue.createMany({
      data: data.issues.map((issue) => ({
        id: `${data.pollId}-${issue.rank}`,
        pollId: data.pollId,
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

    await this.pollsService.markPollComplete({
      pollId: poll.id,
      totalResponses: data.totalResponses,
      confidence: highConfidence ? 'HIGH' : 'LOW',
    })

    if (poll.electedOfficeId) {
      const pollCount = await this.pollsService.model.count({
        where: {
          electedOfficeId: poll.electedOfficeId,
          isCompleted: true,
        },
      })

      await this.analytics.identify(campaign.userId, { pollcount: pollCount })
    }

    await this.analytics.track(
      campaign.userId,
      EVENTS.Polls.ResultsSynthesisCompleted,
      {
        pollId: poll.id,
        path: `/dashboard/polls/${poll.id}`,
        constituencyName: campaign.pathToVictory?.data.electionLocation ?? null,
        'issue 1': data.issues?.at(0)?.theme ?? null,
        'issue 2': data.issues?.at(1)?.theme ?? null,
        'issue 3': data.issues?.at(2)?.theme ?? null,
      },
    )

    this.logger.log(`Poll analysis complete for poll ${data.pollId}`)
  }

  private async getPollAndCampaign(
    pollId: string,
  ): Promise<{ poll: Poll; campaign: CampaignWithPathToVictory } | null> {
    const poll = await this.pollsService.findUnique({ where: { id: pollId } })
    if (!poll || !poll.electedOfficeId) return null

    const campaign = (await this.campaignsService.findFirst({
      where: {
        electedOffices: { some: { id: poll.electedOfficeId } },
      },
      include: {
        pathToVictory: true,
      },
    })) as CampaignWithPathToVictory | null
    if (!campaign) return null

    return { poll, campaign }
  }
}
