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
  electedDate?: Date | null
  swornInDate?: Date | null
  termStartDate?: Date | null
  termEndDate?: Date | null
  termLengthDays?: number | null
  isActive?: boolean
  userId: number
  campaignId: number
  // LEGACY: Remove these 6 fields when org migration is complete.
  //         They are only used by resolveOrgData fallback (no org exists yet).
  //         Once org header is always present, orgData will always be provided by the caller.
  ballotreadyPositionId?: string | null
  office?: string
  otherOffice?: string
  state?: string
  L2DistrictType?: string
  L2DistrictName?: string
  // When provided, used directly for the new EO org instead of looking up the campaign org
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
  constructor(private readonly organizationsService: OrganizationsService) {
    super()
  }
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

    // Resolve org data for the new elected office organization:
    // 1. Explicit orgData from caller (org header path or campaign org)
    // 2. Resolve from election API as fallback (no org exists yet)
    const orgData = await this.resolveOrgDataForCreate(args)

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
          electedDate: args.electedDate,
          swornInDate: args.swornInDate,
          termStartDate: args.termStartDate,
          termEndDate: args.termEndDate,
          termLengthDays: args.termLengthDays,
          isActive: args.isActive,
          userId: args.userId,
          campaignId: args.campaignId,
          organizationSlug: OrganizationsService.electedOfficeOrgSlug(id),
        },
      })
    })
  }

  // LEGACY: When org migration is complete, orgData will always be provided.
  //         Remove this method and the OrganizationsService dependency.
  //         Inline `args.orgData` directly in create().
  private async resolveOrgDataForCreate(args: CreateElectedOfficeArgs) {
    if (args.orgData) {
      return args.orgData
    }

    // LEGACY: Fallback for callers that don't have an org yet — resolve from election API
    return this.organizationsService.resolveOrgData({
      ballotReadyPositionId: args.ballotreadyPositionId,
      office: args.office,
      otherOffice: args.otherOffice,
      state: args.state,
      L2DistrictType: args.L2DistrictType,
      L2DistrictName: args.L2DistrictName,
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

  // LEGACY: Remove when org migration is complete.
  //         Callers should use findFirst({ where: { organizationSlug } }) instead.
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
