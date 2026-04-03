import { Injectable } from '@nestjs/common'
import { PathToVictory, Prisma } from '@prisma/client'
import {
  DEFAULT_PAGINATION_LIMIT,
  DEFAULT_PAGINATION_OFFSET,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
} from 'src/shared/constants/paginationOptions.consts'
import { PaginatedResults } from 'src/shared/types/utility.types'
import { createPrismaBase, MODELS } from '../../prisma/util/prisma.util'
import { ListPathToVictoryPaginationSchema } from '../schemas/ListPathToVictoryPagination.schema'

@Injectable()
export class PathToVictoryService extends createPrismaBase(
  MODELS.PathToVictory,
) {
  create<T extends Prisma.PathToVictoryCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PathToVictoryCreateArgs>,
  ): Promise<Prisma.PathToVictoryGetPayload<T>> {
    return this.model.create(args)
  }

  update<T extends Prisma.PathToVictoryUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PathToVictoryUpdateArgs>,
  ): Promise<Prisma.PathToVictoryGetPayload<T>> {
    return this.model.update(args)
  }

  async listPathToVictories({
    offset: skip = DEFAULT_PAGINATION_OFFSET,
    limit = DEFAULT_PAGINATION_LIMIT,
    sortBy = DEFAULT_SORT_BY,
    sortOrder = DEFAULT_SORT_ORDER,
    userId,
  }: ListPathToVictoryPaginationSchema): Promise<
    PaginatedResults<PathToVictory>
  > {
    const where: Prisma.PathToVictoryWhereInput = {
      ...(userId ? { campaign: { userId } } : {}),
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
