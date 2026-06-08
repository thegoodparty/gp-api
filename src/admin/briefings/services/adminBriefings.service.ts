import { Injectable, NotFoundException } from '@nestjs/common'
import { subDays, subMonths } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { Prisma } from '@/generated/prisma'
import {
  BriefingAdminListQuery,
  BriefingAdminRow,
  BriefingDateRangeFilter,
  PaginatedList,
} from '@goodparty_org/contracts'
import { createPrismaBase, MODELS } from '@/prisma/util/prisma.util'
import { DEFAULT_PAGINATION_OFFSET } from '@/shared/constants/paginationOptions.consts'

const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

type BriefingWithRelations = Prisma.MeetingBriefingGetPayload<{
  include: {
    electedOffice: { include: { user: true; organization: true } }
  }
}>

// user is typed nullable because ElectedOffice.user is an optional relation,
// but the userId FK is required — a briefing without an owner is impossible.
// The null branch is defensive and drops nothing in practice.
const toRow = (b: BriefingWithRelations): BriefingAdminRow | null => {
  const user = b.electedOffice.user
  if (!user) return null
  return {
    briefingId: b.id,
    meetingDate: formatInTimeZone(b.meetingDate, 'UTC', 'yyyy-MM-dd'),
    meetingName: b.artifact?.meeting_name ?? null,
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
    },
    electedOffice: {
      id: b.electedOffice.id,
      organizationSlug: b.electedOffice.organizationSlug,
      positionName: b.electedOffice.organization.customPositionName,
    },
    updatedAt: b.updatedAt,
  }
}

@Injectable()
export class AdminBriefingsService extends createPrismaBase(
  MODELS.MeetingBriefing,
) {
  async list({
    offset = DEFAULT_PAGINATION_OFFSET,
    limit = DEFAULT_LIMIT,
    q,
    dateRange,
  }: BriefingAdminListQuery): Promise<PaginatedList<BriefingAdminRow>> {
    const take = Math.min(limit, MAX_LIMIT)
    const where: Prisma.MeetingBriefingWhereInput = {
      ...(q
        ? {
            electedOffice: {
              user: {
                OR: [
                  {
                    firstName: {
                      contains: q,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                  {
                    lastName: {
                      contains: q,
                      mode: Prisma.QueryMode.insensitive,
                    },
                  },
                  {
                    email: { contains: q, mode: Prisma.QueryMode.insensitive },
                  },
                ],
              },
            },
          }
        : {}),
      ...dateRangeWhere(dateRange),
    }

    const [briefings, total] = await Promise.all([
      this.model.findMany({
        where,
        orderBy: { updatedAt: Prisma.SortOrder.desc },
        skip: offset,
        take,
        include: {
          electedOffice: { include: { user: true, organization: true } },
        },
      }),
      this.model.count({ where }),
    ])

    return {
      data: briefings
        .map(toRow)
        .filter((r): r is BriefingAdminRow => r !== null),
      meta: { total, offset, limit: take },
    }
  }

  async get(id: string): Promise<BriefingAdminRow> {
    const briefing = await this.model.findUnique({
      where: { id },
      include: {
        electedOffice: { include: { user: true, organization: true } },
      },
    })
    const row = briefing ? toRow(briefing) : null
    if (!row) throw new NotFoundException('Briefing not found')
    return row
  }
}

const dateRangeWhere = (
  dateRange?: BriefingDateRangeFilter,
): Prisma.MeetingBriefingWhereInput => {
  if (!dateRange || dateRange === 'All time') return {}
  const now = new Date()
  const since =
    dateRange === 'last 12 months'
      ? subMonths(now, 12)
      : dateRange === 'last 30 days'
        ? subDays(now, 30)
        : subDays(now, 7)
  return { meetingDate: { gte: since } }
}
