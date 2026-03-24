import { OrganizationsService } from '@/organizations/services/organizations.service'
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
import { v7 as uuidv7 } from 'uuid'
import { ListElectedOfficePaginationSchema } from '../schemas/ListElectedOfficePagination.schema'

export type CreateElectedOfficeArgs = {
  swornInDate?: Date | null
  userId: number
  campaignId: number
  ballotreadyPositionId?: string | null
  office?: string
  otherOffice?: string
  state?: string
  L2DistrictType?: string
  L2DistrictName?: string
}

@Injectable()
export class ElectedOfficeService extends createPrismaBase(
  MODELS.ElectedOffice,
) {
  constructor(private readonly organizationsService: OrganizationsService) {
    super()
  }

  async create(args: CreateElectedOfficeArgs) {
    const existing = await this.model.findFirst({
      where: { userId: args.userId },
    })
    if (existing) {
      throw new ConflictException('User already has an active elected office')
    }

    // If the campaign already has an organization, copy its resolved fields
    // instead of re-resolving from the election API.
    const campaignOrgSlug = OrganizationsService.campaignOrgSlug(
      args.campaignId,
    )
    const campaignOrg = await this.organizationsService.findUnique({
      where: { slug: campaignOrgSlug },
    })

    const orgData = campaignOrg
      ? {
          positionId: campaignOrg.positionId,
          customPositionName: campaignOrg.customPositionName,
          overrideDistrictId: campaignOrg.overrideDistrictId,
        }
      : await this.organizationsService.resolveOrgData({
          ballotReadyPositionId: args.ballotreadyPositionId,
          office: args.office,
          otherOffice: args.otherOffice,
          state: args.state,
          L2DistrictType: args.L2DistrictType,
          L2DistrictName: args.L2DistrictName,
        })

    return this.client.$transaction(async (tx) => {
      const id = uuidv7()

      await tx.organization.create({
        data: {
          slug: OrganizationsService.electedOfficeOrgSlug(id),
          ownerId: args.userId,
          ...orgData,
        },
      })

      return await tx.electedOffice.create({
        data: {
          id,
          swornInDate: args.swornInDate,
          userId: args.userId,
          campaignId: args.campaignId,
          organizationSlug: OrganizationsService.electedOfficeOrgSlug(id),
        },
      })
    })
  }

  async update(args: Prisma.ElectedOfficeUpdateArgs) {
    return this.model.update(args)
  }

  delete(args: Prisma.ElectedOfficeDeleteArgs) {
    return this.model.delete(args)
  }

  getCurrentElectedOffice(userId: number) {
    return this.model.findFirst({
      where: { userId },
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
