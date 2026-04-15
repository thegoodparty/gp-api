import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'

@Injectable()
export class ExperimentRunsService extends createPrismaBase(
  MODELS.ExperimentRun,
) {
  async updateMany(args: Prisma.ExperimentRunUpdateManyArgs) {
    return this.model.updateMany(args)
  }
}
