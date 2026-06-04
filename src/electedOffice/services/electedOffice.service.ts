import { OrganizationsService } from '@/organizations/services/organizations.service'
import { Inject, Injectable, forwardRef } from '@nestjs/common'
import { ElectedOffice, Prisma } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { isUniqueConstraintError } from 'src/prisma/util/prismaErrors.util'
import {
  DEFAULT_PAGINATION_LIMIT,
  DEFAULT_PAGINATION_OFFSET,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
} from 'src/shared/constants/paginationOptions.consts'
import { PaginatedResults } from 'src/shared/types/utility.types'
import { v7 as uuidv7 } from 'uuid'
import { MeetingBriefingsService } from '@/meetings/services/meetingBriefings.service'
import { ListElectedOfficePaginationSchema } from '../schemas/ListElectedOfficePagination.schema'

export type CreateElectedOfficeArgs = {
  swornInDate?: Date | null
  userId: number
  campaignId?: number
  orgData?: {
    positionId: string | null
    customPositionName: string | null
    overrideDistrictId: string | null
  }
}

@Injectable()
export class ElectedOfficeService extends createPrismaBase(
  MODELS.ElectedOffice,
) {
  constructor(
    @Inject(forwardRef(() => MeetingBriefingsService))
    private readonly meetingBriefings: MeetingBriefingsService,
  ) {
    super()
  }

  async create(args: CreateElectedOfficeArgs) {
    const existing = await this.model.findFirst({
      where: { userId: args.userId },
    })
    if (existing) {
      // A prior call may have committed the row but crashed before dispatching
      // the schedule; the schedule dispatch is the only recovery path (the
      // daily cron dispatches briefings, not the initial schedule), so re-run
      // it here. onElectedOfficeCreated tolerates re-dispatch.
      await this.dispatchScheduleAfterCreate(existing)
      return existing
    }

    const orgData = args.orgData ?? {
      positionId: null,
      customPositionName: null,
      overrideDistrictId: null,
    }

    let created: ElectedOffice
    try {
      created = await this.client.$transaction(async (tx) => {
        const id = uuidv7()

        await tx.organization.create({
          data: {
            slug: OrganizationsService.electedOfficeOrgSlug(id),
            ownerId: args.userId,
            ...orgData,
          },
        })

        return tx.electedOffice.create({
          data: {
            id,
            swornInDate: args.swornInDate,
            userId: args.userId,
            campaignId: args.campaignId,
            organizationSlug: OrganizationsService.electedOfficeOrgSlug(id),
          },
        })
      })
    } catch (err) {
      // A concurrent create that wins the race trips the userId unique
      // constraint; the transaction rolls back (no orphan org) and we return
      // the row the other caller committed, keeping the endpoint idempotent.
      if (isUniqueConstraintError(err)) {
        const concurrent = await this.model.findFirst({
          where: { userId: args.userId },
        })
        if (concurrent) {
          await this.dispatchScheduleAfterCreate(concurrent)
          return concurrent
        }
      }
      throw err
    }

    await this.dispatchScheduleAfterCreate(created)

    return created
  }

  private async dispatchScheduleAfterCreate(
    electedOffice: ElectedOffice,
  ): Promise<void> {
    await this.meetingBriefings
      .onElectedOfficeCreated(electedOffice)
      .catch((err: Error) => {
        this.logger.error(
          { err, electedOfficeId: electedOffice.id },
          'meeting schedule dispatch failed after EO created',
        )
      })
  }

  async update(args: Prisma.ElectedOfficeUpdateArgs) {
    return this.model.update(args)
  }

  delete(args: Prisma.ElectedOfficeDeleteArgs) {
    return this.model.delete(args)
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
