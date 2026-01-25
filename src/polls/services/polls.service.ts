import { addBusinessDays } from 'date-fns'
import { BadRequestException, Injectable } from '@nestjs/common'
import { PollConfidence, Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { inngest } from 'src/inngest/inngest.client'
import { APIPollStatus, derivePollStatus } from '../polls.types'

type PollCreateInput = Omit<
  Prisma.PollCreateInput,
  'estimatedCompletionDate' | 'electedOffice' | 'issues' | 'individualMessages'
> & {
  electedOfficeId: string
}

const estimatedCompletionDate = (scheduledDate: Date | string) =>
  addBusinessDays(scheduledDate, 3)

@Injectable()
export class PollsService extends createPrismaBase(MODELS.Poll) {
  private async sendPollCreationEvent(pollId: string) {
    if (process.env.NODE_ENV === 'test') return
    await inngest.send({
      name: 'polls/creation.requested',
      data: { pollId },
    })
  }

  private async sendPollExpansionEvent(pollId: string) {
    if (process.env.NODE_ENV === 'test') return
    await inngest.send({
      name: 'polls/expansion.requested',
      data: { pollId },
    })
  }

  async create(input: PollCreateInput) {
    const poll = await this.client.poll.create({
      data: {
        ...input,
        estimatedCompletionDate: estimatedCompletionDate(input.scheduledDate),
      },
    })
    await this.sendPollCreationEvent(poll.id)

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
        if (
          ![APIPollStatus.SCHEDULED, APIPollStatus.IN_PROGRESS].includes(
            derivePollStatus(poll),
          )
        ) {
          throw new BadRequestException('Poll is not in-progress')
        }

        return {
          isCompleted: true,
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
    scheduledDate: Date
  }) {
    const result = await this.optimisticLockingUpdate(
      { where: { id: params.pollId } },
      (poll) => {
        if (derivePollStatus(poll) !== APIPollStatus.COMPLETED) {
          throw new BadRequestException('Poll is not completed')
        }

        return {
          isCompleted: false,
          scheduledDate: params.scheduledDate,
          estimatedCompletionDate: estimatedCompletionDate(
            params.scheduledDate,
          ),
          targetAudienceSize:
            poll.targetAudienceSize + params.additionalRecipientCount,
        }
      },
    )

    await this.sendPollExpansionEvent(params.pollId)

    return result
  }
}
