import {
  BadGatewayException,
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
import { PollIndividualMessageToBackfill } from '../types/pollPurchase.types'
import parseCsv from 'neat-csv'

const CSVsToBackfill = [
  {
    pollId: '019a367a-8dcc-7f51-9774-46ad859c9c44',
    url: 'https://assets.goodparty.org/tevyn-poll-csvs/019a367a-8dcc-7f51-9774-46ad859c9c44-1761850593514.csv',
    date: new Date(1761850593514),
  },
  {
    pollId: '019a367f-b7c2-71a3-b140-adefc9b7ba0a',
    url: 'https://assets.goodparty.org/tevyn-poll-csvs/019a367f-b7c2-71a3-b140-adefc9b7ba0a-1761850932008.csv',
    date: new Date(1761850932008),
  },
  {
    pollId: '019a3684-30ca-7451-88c7-1328a327e025',
    url: 'https://assets.goodparty.org/tevyn-poll-csvs/019a3684-30ca-7451-88c7-1328a327e025-1761851225486.csv',
    date: new Date(1761851225486),
  },
  {
    pollId: '019a3b1f-ef43-7511-8319-ed53edde0105',
    url: 'https://assets.goodparty.org/tevyn-poll-csvs/019a3b1f-ef43-7511-8319-ed53edde0105-1761931141807.csv',
    date: new Date(1761931141807),
  },
  {
    pollId: '019a3b4b-31d9-7753-b0cf-e4030bc8d572',
    url: 'https://assets.goodparty.org/tevyn-poll-csvs/019a3b4b-31d9-7753-b0cf-e4030bc8d572-1761931376299.csv',
    date: new Date(1761931376299),
  },
  {
    pollId: '019a3ba0-ffb4-7343-87aa-69dc44ddcca2',
    url: 'https://assets.goodparty.org/tevyn-poll-csvs/019a3ba0-ffb4-7343-87aa-69dc44ddcca2-1761937000936.csv',
    date: new Date(1761937000936),
  },
  {
    pollId: '019a3bf6-af50-7fd2-94fe-39fe61e2bce9',
    url: 'https://assets.goodparty.org/tevyn-poll-csvs/019a3bf6-af50-7fd2-94fe-39fe61e2bce9-1761942614518.csv',
    date: new Date(1761942614518),
  },
]
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

  async backfillIndividualMessages(): Promise<number> {
    for (const csvToBackfill of CSVsToBackfill) {
      const { pollId, url, date } = csvToBackfill

      const poll = await this.client.poll.findUnique({
        where: { id: pollId },
      })

      if (!poll) {
        this.logger.warn('Poll not found during backfill', { pollId })
        continue
      }

      await this.createIndividualMessages(pollId, url, date)
    }

    return CSVsToBackfill.length
  }

  async createIndividualMessages(pollId: string, csvUrl: string, date: Date) {
    let csv: string
    try {
      const response = await fetch(csvUrl)
      csv = await response.text()
    } catch (error: unknown) {
      this.logger.error('Failed to fetch csv', error)
      throw new BadGatewayException(`Failed to fetch csv: ${String(error)}`)
    }

    const people = await parseCsv<PollIndividualMessageToBackfill>(csv)

    const messagesToCreate: Prisma.PollIndividualMessageCreateManyInput[] = []
    for (const person of people) {
      messagesToCreate.push({
        id: `${pollId}-${person.id}`,
        pollId,
        personId: person.id,
        sentAt: date,
      })
    }

    await this.client.pollIndividualMessage.createMany({
      data: messagesToCreate,
      skipDuplicates: true,
    })
  }
}
