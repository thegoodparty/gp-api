import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class PollsService extends createPrismaBase(MODELS.Poll) {
  constructor() {
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
}
