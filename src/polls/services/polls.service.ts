import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
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
}
