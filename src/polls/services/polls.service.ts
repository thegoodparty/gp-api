import { BadRequestException, Injectable } from '@nestjs/common'
import { PollConfidence, Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { buildTevynApiSlackBlocks } from '../utils/polls.utils'
import { SlackChannel } from 'src/vendors/slack/slackService.types'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { add } from 'date-fns'
import { ElectedOffice } from '@prisma/client'
@Injectable()
export class PollsService extends createPrismaBase(MODELS.Poll) {
  constructor(private readonly slack: SlackService) {
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

  async createInitialPoll(
    message: string,
    userInfo: { name?: string; email: string; phone?: string },
    electedOffice: ElectedOffice,
    createPoll: boolean,
    imageUrl?: string,
    csvFileUrl?: string,
  ) {
    const now = new Date()
    let pollId: string | undefined = undefined
    if (createPoll) {
      const poll = await this.create({
        data: {
          name: 'Top Community Issues',
          status: 'IN_PROGRESS',
          messageContent: message,
          targetAudienceSize: 500,
          scheduledDate: now,
          estimatedCompletionDate: add(now, { weeks: 1 }),
          imageUrl: imageUrl,
          electedOfficeId: electedOffice.id,
        },
      })
      pollId = poll.id
    }

    const blocks = buildTevynApiSlackBlocks({
      message,
      pollId,
      csvFileUrl,
      imageUrl,
      userInfo,
    })

    await this.slack.message({ blocks }, SlackChannel.botTevynApi)

    return true
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

  async expandPoll(params: { pollId: string; newTotalAudienceSize: number }) {
    const result = await this.client.poll.updateManyAndReturn({
      // This is a database-level check to ensure the poll is in the expected state.
      // Sadly, Prisma doesn't natively support row-level locking on transactions,
      // which would be a little cleaner :(
      // https://github.com/prisma/prisma/issues/8580
      where: { id: params.pollId, status: 'COMPLETED' },
      data: {
        status: 'EXPANDING',
        estimatedCompletionDate: add(new Date(), { weeks: 1 }),
        targetAudienceSize: params.newTotalAudienceSize,
      },
    })

    if (result.length === 0) {
      this.logger.debug(
        'Cannot mark poll as expanding because it is not in completed state',
        { pollId: params.pollId },
      )
      throw new BadRequestException('Poll not in completed state')
    }

    // TODO: send message to tevyn to expand the poll

    return result[0]
  }
}
