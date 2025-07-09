import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { Prisma } from '@prisma/client'
import { CreateCommunityIssueSchema } from '../schemas/CreateCommunityIssue.schema'
import { v4 as uuidv4 } from 'uuid'

@Injectable()
export class CommunityIssuesService extends createPrismaBase(
  MODELS.CommunityIssue,
) {
  create(campaignId: number, data: CreateCommunityIssueSchema) {
    const uuid = uuidv4()
    return this.model.create({
      data: {
        ...data,
        uuid,
        campaignId,
      },
    })
  }

  update(args: Prisma.CommunityIssueUpdateArgs) {
    return this.model.update(args)
  }

  delete(args: Prisma.CommunityIssueDeleteArgs) {
    return this.model.delete(args)
  }

  findByUuid(uuid: string, campaignId: number) {
    return this.model.findUniqueOrThrow({
      where: { uuid, campaignId },
    })
  }

  findByUuidWithStatusLogs(uuid: string, campaignId: number) {
    return this.model.findUniqueOrThrow({
      where: { uuid, campaignId },
      include: { statusLogs: true },
    })
  }
}
