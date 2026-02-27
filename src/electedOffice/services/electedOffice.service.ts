import { ConflictException, Injectable } from '@nestjs/common'
import { ElectedOffice, Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import {
  DEFAULT_PAGINATION_LIMIT,
  DEFAULT_PAGINATION_OFFSET,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
} from 'src/shared/constants/paginationOptions.consts'
import { PaginatedResults } from 'src/shared/types/utility.types'
import { ListElectedOfficePaginationSchema } from '../schemas/ListElectedOfficePagination.schema'
import { v7 as uuidv7 } from 'uuid'

export type CreateElectedOfficeArgs = {
  electedDate?: Date | null
  swornInDate?: Date | null
  termStartDate?: Date | null
  termEndDate?: Date | null
  termLengthDays?: number | null
  isActive?: boolean
  userId: number
  campaignId: number
}

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

  async create(args: CreateElectedOfficeArgs) {
    // if isActive is not false, then we need to validate that the user does not
    // already have an active elected office
    if (args.isActive !== false) {
      await this.validateActiveElectedOffice(args.userId)
    }

    // TODO: collect a position id and validate it via election-api

    return this.client.$transaction(async (tx) => {
      const id = uuidv7()

      await tx.organization.create({
        data: {
          slug: `eo-${id}`,
          ownerId: args.userId,
          positionId: 'TODO SWAIN',
        },
      })

      return await tx.electedOffice.create({
        data: {
          id,
          electedDate: args.electedDate,
          swornInDate: args.swornInDate,
          termStartDate: args.termStartDate,
          termEndDate: args.termEndDate,
          termLengthDays: args.termLengthDays,
          isActive: args.isActive,
          userId: args.userId,
          campaignId: args.campaignId,
          organizationSlug: `eo-${id}`,
        },
      })
    })
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

  async listElectedOffices({
    offset: skip = DEFAULT_PAGINATION_OFFSET,
    limit = DEFAULT_PAGINATION_LIMIT,
    sortBy = DEFAULT_SORT_BY,
    sortOrder = DEFAULT_SORT_ORDER,
    userId,
  }: ListElectedOfficePaginationSchema): Promise<
    PaginatedResults<ElectedOffice>
  > {
    const where: Prisma.ElectedOfficeWhereInput = {
      ...(userId ? { userId } : {}),
    }

    return {
      data: await this.model.findMany({
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        where,
      }),
      meta: {
        total: await this.model.count({ where }),
        offset: skip,
        limit,
      },
    }
  }
}
