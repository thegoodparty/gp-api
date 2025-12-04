import { add, addDays } from 'date-fns'
import { BadRequestException, Injectable } from '@nestjs/common'
import { PollConfidence, PollStatus, Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { QueueType } from 'src/queue/queue.types'
import { pollMessageGroup } from '../utils/polls.utils'

type PollCreateInput = Omit<
  Prisma.PollCreateInput,
  'estimatedCompletionDate' | 'electedOffice' | 'issues' | 'individualMessages'
> & {
  electedOfficeId: string
}

@Injectable()
export class PollsService extends createPrismaBase(MODELS.Poll) {
  constructor(private readonly queueProducer: QueueProducerService) {
    super()
  }

  async create(input: PollCreateInput) {
    const poll = await this.client.poll.create({
      data: {
        ...input,
        estimatedCompletionDate: addDays(input.scheduledDate, 7),
      },
    })
    await this.queueProducer.sendMessage(
      { type: QueueType.POLL_CREATION, data: { pollId: poll.id } },
      pollMessageGroup(poll.id),
    )

    return poll
  }

  async update(args: Prisma.PollUpdateArgs) {
    return this.model.update(args)
  }

  async delete(args: Prisma.PollDeleteArgs) {
    return this.model.delete(args)
  }

  async hasPolls(electedOfficeId: string): Promise<boolean> {
    const poll = await this.model.findFirst({
      where: { electedOfficeId },
      take: 1,
    })
    return poll !== null
  }

  async markPollComplete(params: {
    pollId: string
    totalResponses: number
    confidence: PollConfidence
  }) {
    return this.optimisticLockingUpdate(
      { where: { id: params.pollId } },
      (poll) => {
        if (poll.status !== 'IN_PROGRESS' && poll.status !== 'EXPANDING') {
          throw new BadRequestException(
            'Poll is not in in-progress or expanding state',
          )
        }

        return {
          status: 'COMPLETED',
          confidence: params.confidence,
          responseCount: params.totalResponses,
          completedDate: new Date(),
        }
      },
    )
  }

  async expandPoll(params: {
    pollId: string
    additionalRecipientCount: number
  }) {
    const result = await this.optimisticLockingUpdate(
      { where: { id: params.pollId } },
      (poll) => {
        if (poll.status !== 'COMPLETED') {
          throw new BadRequestException('Poll is not completed')
        }

        return {
          status: PollStatus.EXPANDING,
          estimatedCompletionDate: add(new Date(), { weeks: 1 }),
          targetAudienceSize:
            poll.targetAudienceSize + params.additionalRecipientCount,
        }
      },
    )

    await this.queueProducer.sendMessage(
      { type: QueueType.POLL_EXPANSION, data: { pollId: params.pollId } },
      pollMessageGroup(params.pollId),
    )

    return result
  }
}
