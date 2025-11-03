import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common'
import { PollConfidence, Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { add } from 'date-fns'
import { QueueProducerService } from 'src/queue/producer/queueProducer.service'
import { QueueType } from 'src/queue/queue.types'
import { pollMessageGroup } from '../utils/polls.utils'

@Injectable()
export class PollsService extends createPrismaBase(MODELS.Poll) {
  constructor(private readonly queueProducer: QueueProducerService) {
    super()
  }
  async create(args: Prisma.PollCreateArgs) {
    return this.model.create(args)
  }

  async update(args: Prisma.PollUpdateArgs) {
    return this.model.update(args)
  }

  async delete(args: Prisma.PollDeleteArgs) {
    return this.model.delete(args)
  }

  async markPollComplete(params: {
    pollId: string
    totalResponses: number
    confidence: PollConfidence
  }) {
    const result = await this.client.poll.updateManyAndReturn({
      where: {
        id: params.pollId,
        // This is a database-level check to ensure the poll is in the expected state.
        // Sadly, Prisma doesn't natively support row-level locking on transactions,
        // which would be a little cleaner :(
        // https://github.com/prisma/prisma/issues/8580
        status: { in: ['IN_PROGRESS', 'EXPANDING'] },
      },
      data: {
        status: 'COMPLETED',
        confidence: params.confidence,
        responseCount: params.totalResponses,
        completedDate: new Date(),
      },
    })

    if (result.length === 0) {
      this.logger.debug(
        'Cannot mark poll as completed because it is not in in-progress or expanding state',
        { pollId: params.pollId },
      )
      throw new BadRequestException(
        'Poll not in in-progress or expanding state',
      )
    }

    return result[0]
  }

  async expandPoll(params: {
    pollId: string
    additionalRecipientCount: number
  }) {
    const poll = await this.client.poll.findUnique({
      where: { id: params.pollId },
    })
    if (!poll) {
      throw new BadRequestException('Poll not found')
    }

    if (poll.status !== 'COMPLETED') {
      throw new BadRequestException('Poll is not completed')
    }

    const newTotalAudienceSize =
      poll.targetAudienceSize + params.additionalRecipientCount
    const result = await this.client.poll.updateManyAndReturn({
      // This is a database-level check to ensure the poll is in the expected state.
      // Sadly, Prisma doesn't natively support row-level read-then-write locking on
      // transactions, which would be a lot cleaner :(
      // https://github.com/prisma/prisma/issues/8580
      where: {
        id: params.pollId,
        status: 'COMPLETED',
        targetAudienceSize: poll.targetAudienceSize,
      },
      data: {
        status: 'EXPANDING',
        estimatedCompletionDate: add(new Date(), { weeks: 1 }),
        targetAudienceSize: newTotalAudienceSize,
      },
    })

    if (result.length === 0) {
      this.logger.debug(
        'Cannot mark poll as expanding because it is not in completed state',
        { pollId: params.pollId },
      )
      throw new ConflictException('Poll is not in expected state')
    }

    await this.queueProducer.sendMessage(
      { type: QueueType.POLL_EXPANSION, data: { pollId: params.pollId } },
      pollMessageGroup(params.pollId),
    )

    return result[0]
  }
}
