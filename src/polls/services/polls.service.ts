import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class PollsService extends createPrismaBase(MODELS.Poll) {
  constructor() {
    super()
  }

  async markPollComplete(params: { pollId: string; totalResponses: number }) {
    const existing = await this.findUniqueOrThrow({
      where: { id: params.pollId },
    })

    if (existing.status !== 'IN_PROGRESS') {
      throw new Error('Poll is not currently in-progress')
    }

    const updated = await this.model.updateMany({
      where: { id: params.pollId, status: 'IN_PROGRESS' },
      data: {
        status: 'COMPLETED',
        responseCount: params.totalResponses,
        // TODO: calculate confidence based on constituency size.
        confidence: 'LOW',
        completedDate: new Date(),
      },
    })

    if (updated.count === 0) {
      throw new Error('Poll is not currently in-progress')
    }
  }
}
