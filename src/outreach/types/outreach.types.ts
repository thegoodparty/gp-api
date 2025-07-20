import { Prisma } from '@prisma/client'

export type OutreachWithVoterFileFilter = Prisma.OutreachGetPayload<{
  include: { voterFileFilter: true }
}>
