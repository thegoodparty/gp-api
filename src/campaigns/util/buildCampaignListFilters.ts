import { CampaignListSchema } from '../schemas/campaignList.schema'
import { Prisma } from '@prisma/client'

export function buildCampaignListFilters({
  id,
  state,
  slug,
  email,
  level,
  primaryElectionDateStart,
  primaryElectionDateEnd,
  campaignStatus,
  generalElectionDateStart,
  generalElectionDateEnd,
  p2vStatus,
}: CampaignListSchema): Prisma.CampaignWhereInput {
  // store AND array in var for easy push access
  const andConditions: Prisma.CampaignWhereInput[] = []

  if (id) andConditions.push({ id })
  if (slug) andConditions.push({ slug: { equals: slug, mode: 'insensitive' } })
  if (email) {
    andConditions.push({
      user: {
        email: {
          contains: email,
          mode: 'insensitive',
        },
      },
    })
  }
  if (state) {
    andConditions.push({
      details: {
        path: ['state'],
        string_contains: state,
        mode: 'insensitive',
      },
    })
  }
  if (level) {
    andConditions.push({
      details: {
        path: ['ballotLevel'],
        string_contains: level,
        mode: 'insensitive',
      },
    })
  }
  if (campaignStatus) {
    andConditions.push({
      isActive: campaignStatus === 'active',
    })
  }
  if (p2vStatus) {
    andConditions.push({
      pathToVictory: {
        data: {
          path: ['p2vStatus'],
          string_contains: p2vStatus,
          mode: 'insensitive',
        },
      },
    })
  }
  if (generalElectionDateStart) {
    andConditions.push({
      details: {
        path: ['electionDate'],
        gte: generalElectionDateStart,
      },
    })
  }
  if (generalElectionDateEnd) {
    andConditions.push({
      details: {
        path: ['electionDate'],
        lte: generalElectionDateEnd,
      },
    })
  }
  if (primaryElectionDateStart) {
    andConditions.push({
      details: {
        path: ['primaryElectionDate'],
        gte: primaryElectionDateStart,
      },
    })
  }
  if (primaryElectionDateEnd) {
    andConditions.push({
      details: {
        path: ['primaryElectionDate'],
        lte: primaryElectionDateEnd,
      },
    })
  }

  return { AND: andConditions }
}
