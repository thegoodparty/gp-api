import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { Prisma } from '@prisma/client'

@Injectable()
export class ElectedOfficeService extends createPrismaBase(
  MODELS.ElectedOffice,
) {
  create(args: Prisma.ElectedOfficeCreateArgs) {
    return this.model.create(args)
  }

  update(args: Prisma.ElectedOfficeUpdateArgs) {
    return this.model.update(args)
  }

  delete(args: Prisma.ElectedOfficeDeleteArgs) {
    return this.model.delete(args)
  }
}
