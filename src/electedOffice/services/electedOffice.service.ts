import { ConflictException, Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class ElectedOfficeService extends createPrismaBase(
  MODELS.ElectedOffice,
) {
  // This is for validating that there is only one active elected office per user
  // prisma at the time of writing does not support partial unique indexes, so we have to do this manually
  //    eg. Unique UserId with where: { isActive: true } is not supported.
  //        If we did it without value check, then there could only be one inactive elected office
  private async validateActiveElectedOffice(
    userId: number,
    excludeId?: string,
  ) {
    const activeCount = await this.model.count({
      where: {
        userId,
        isActive: true,
        ...(excludeId && { id: { not: excludeId } }),
      },
    })

    if (activeCount > 0) {
      throw new ConflictException('User already has an active elected office')
    }
  }

  async create(args: Prisma.ElectedOfficeCreateArgs) {
    const data = args.data as Prisma.ElectedOfficeCreateInput

    // if isActive is not false, then we need to validate that the user does not already have an active elected office
    if (data.isActive !== false && data.user?.connect?.id) {
      await this.validateActiveElectedOffice(data.user.connect.id)
    }

    return this.model.create(args)
  }

  async update(args: Prisma.ElectedOfficeUpdateArgs) {
    const data = args.data as Prisma.ElectedOfficeUpdateInput

    if (data.isActive === true) {
      const existing = await this.model.findUnique({
        where: args.where,
        select: { userId: true },
      })

      if (existing) {
        await this.validateActiveElectedOffice(existing.userId, args.where.id)
      }
    }

    return this.model.update(args)
  }

  delete(args: Prisma.ElectedOfficeDeleteArgs) {
    return this.model.delete(args)
  }

  getCurrentElectedOffice(userId: number) {
    return this.model.findFirst({
      where: { userId, isActive: true },
    })
  }
}
