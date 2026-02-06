import { PollIndividualMessageService } from '@/polls/services/pollIndividualMessage.service'
import { Injectable } from '@nestjs/common'
import {
  Poll,
  PollIndividualMessage,
  PollIndividualMessageSender,
  Prisma,
} from '@prisma/client'
import { IndividualActivityInput } from './contactEngagement.schema'
import {
  ConstituentActivity,
  ConstituentActivityEventType,
  ConstituentActivityType,
  ConstituentIssue,
  GetConstituentIssuesResponse,
  GetIndividualActivitiesResponse,
} from './contactEngagement.types'

type PollIndividualMessageWithPoll = PollIndividualMessage & { poll: Poll }

@Injectable()
export class ContactEngagementService {
  constructor(
    private readonly pollIndividualMessage: PollIndividualMessageService,
  ) {}

  async getIndividualActivities(
    input: IndividualActivityInput,
  ): Promise<GetIndividualActivitiesResponse> {
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
      })

    const messagesByPollId = new Map<string, PollIndividualMessageWithPoll[]>()
    for (const message of messages) {
      const key = String(message.pollId)
      const list = messagesByPollId.get(key) ?? []
      list.push(message)
      messagesByPollId.set(key, list)
    }

    const allActivities: ConstituentActivity[] = []
    for (const [, pollMessages] of messagesByPollId) {
      const sortedBySentAt = [...pollMessages].sort(
        (a, b) => b.sentAt.getTime() - a.sentAt.getTime(),
      )
      const mostRecent = sortedBySentAt[0]
      const events = sortedBySentAt.map((msg) => {
        const eventType =
          msg.sender === PollIndividualMessageSender.ELECTED_OFFICIAL
            ? ConstituentActivityEventType.SENT
            : msg.isOptOut
              ? ConstituentActivityEventType.OPTED_OUT
              : ConstituentActivityEventType.RESPONDED
        return {
          type: eventType,
          date: msg.sentAt.toISOString(),
        }
      })
      allActivities.push({
        type: ConstituentActivityType.POLL_INTERACTIONS,
        date: mostRecent.sentAt.toISOString(),
        data: {
          pollId: mostRecent.pollId,
          pollTitle: mostRecent.poll.name,
          events: events.reverse(),
        },
      })
    }
    allActivities.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    )

    const startIndex = after
      ? allActivities.findIndex((a) => a.data.pollId === after) + 1
      : 0
    const page = allActivities.slice(startIndex, startIndex + limit + 1)
    const results = page.slice(0, limit)
    const nextCursor =
      page.length > limit
        ? (results[results.length - 1]?.data.pollId ?? null)
        : null

    return { nextCursor, results }
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
