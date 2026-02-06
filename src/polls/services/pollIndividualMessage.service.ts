import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class PollIndividualMessageService extends createPrismaBase(
  MODELS.PollIndividualMessage,
) {}
