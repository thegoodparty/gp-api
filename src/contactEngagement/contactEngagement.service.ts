import { Injectable } from '@nestjs/common'
import {
  Poll,
  PollIndividualMessage,
  PollIndividualMessageSender,
  Prisma,
} from '@prisma/client'
import { PollIndividualMessageService } from '@/polls/services/pollIndividualMessage.service'
import {
  ConstituentActivity,
  ConstituentActivityEventType,
  ConstituentActivityType,
  ConstituentIssue,
  GetConstituentIssuesResponse,
  GetIndividualActivitiesResponse,
} from './contactEngagement.types'
import { IndividualActivityInput } from './contactEngagement.schema'

type PollIndividualMessageWithPoll = PollIndividualMessage & { poll: Poll }

@Injectable()
export class ContactEngagementService {
  constructor(
    private readonly pollIndividualMessage: PollIndividualMessageService,
  ) {}

  async getIndividualActivities(
    input: IndividualActivityInput,
  ): Promise<GetIndividualActivitiesResponse> {
    // This method returns the activities by **most recent** first
    // Events within the activity are sorted by **oldest** first
    const { personId, take, after, electedOfficeId } = input
    const limit = take ?? 20

    const messages: PollIndividualMessageWithPoll[] =
      await this.pollIndividualMessage.findMany({
        where: {
          electedOfficeId,
          personId,
        },
        include: {
          poll: true,
        },
        orderBy: { sentAt: Prisma.SortOrder.desc },
        take: limit + 1,
        ...(after ? { cursor: { id: after }, skip: 1 } : {}),
      })

    // Check if there are more results beyond the requested limit
    const nextCursor = messages.at(limit)?.id ?? null
    const messagesToProcess = messages.slice(0, limit)

    const pollsWithActivitesByPollId = new Map<string, ConstituentActivity>()
    for (const message of messagesToProcess) {
      const eventType =
        message.sender == PollIndividualMessageSender.ELECTED_OFFICIAL
          ? ConstituentActivityEventType.SENT
          : message.isOptOut
            ? ConstituentActivityEventType.OPTED_OUT
            : ConstituentActivityEventType.RESPONDED
      const existing = pollsWithActivitesByPollId.get(message.pollId)
      if (existing) {
        existing.data.events.push({
          type: eventType,
          date: message.sentAt.toISOString(),
        })
      }
      if (!existing) {
        pollsWithActivitesByPollId.set(message.pollId, {
          type: ConstituentActivityType.POLL_INTERACTIONS,
          date: message.sentAt.toISOString(),
          data: {
            pollId: message.pollId,
            pollTitle: message.poll.name,
            events: [
              {
                type: eventType,
                date: message.sentAt.toISOString(),
              },
            ],
          },
        })
        continue
      }
    }
    return {
      nextCursor,
      results: Array.from(pollsWithActivitesByPollId.values()).map(
        (activity) => ({
          ...activity,
          data: {
            ...activity.data,
            events: [...activity.data.events].reverse(),
          },
        }),
      ),
    }
  }

  async getConstituentIssues(
    personId: string,
    electedOfficeId: string,
    take: number,
    after: string | undefined,
  ): Promise<GetConstituentIssuesResponse> {
    const skip = after ? Math.max(0, parseInt(after, 10) || 0) : 0
    // oversample by 1 to check if there are more messages
    const messageLimit = Math.max(1, take) + 1
    const messages = await this.pollIndividualMessage.findMany({
      where: {
        personId,
        electedOfficeId,
        sender: 'CONSTITUENT',
        pollIssues: { some: {} },
      },
      include: {
        pollIssues: true,
        poll: { select: { id: true, name: true } },
      },
      orderBy: { sentAt: 'desc' },
      skip,
      take: messageLimit,
    })
    const hasMore = messages.length > take
    const nextCursor = hasMore ? String(skip + take) : null
    //split off the oversampled message
    const pageMessages = hasMore ? messages.slice(0, take) : messages
    const results: ConstituentIssue[] = []
    for (const msg of pageMessages) {
      const date = msg.sentAt.toISOString()
      for (const issue of msg.pollIssues) {
        results.push({
          issueTitle: issue.title,
          issueSummary: issue.summary ?? '',
          pollTitle: msg.poll.name,
          pollId: msg.poll.id,
          date,
        })
      }
    }
    return {
      nextCursor,
      results,
    }
  }
}
