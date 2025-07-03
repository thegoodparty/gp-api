import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { Prisma } from '@prisma/client'
import { CreateCommunityIssueSchema } from '../schemas/CreateCommunityIssue.schema'

@Injectable()
export class CommunityIssuesService extends createPrismaBase(
  MODELS.CommunityIssue,
) {
  create(campaignId: number, data: CreateCommunityIssueSchema) {
    return this.model.create({
      data: {
        ...data,
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
}
