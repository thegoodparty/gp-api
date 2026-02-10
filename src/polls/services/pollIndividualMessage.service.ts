import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

/** Create input with isOptOut, content, electedOfficeId, and pollIssues required */
export type PollIndividualMessageCreateData = Omit<
  Prisma.PollIndividualMessageUncheckedCreateInput,
  'isOptOut' | 'content' | 'electedOfficeId' | 'pollIssues'
> &
  Required<
    Pick<
      Prisma.PollIndividualMessageUncheckedCreateInput,
      'isOptOut' | 'content' | 'electedOfficeId' | 'pollIssues'
    >
  >

@Injectable()
export class PollIndividualMessageService extends createPrismaBase(
  MODELS.PollIndividualMessage,
) {
  async create(data: PollIndividualMessageCreateData) {
    return this.model.create({ data })
  }
}
