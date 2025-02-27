import { caseInsensitiveCompare } from 'src/prisma/util/json.util'
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
  // base query
  const where: Prisma.CampaignWhereInput = {
    NOT: {
      user: null,
    },
    AND: [],
  }

  // store AND array in var for easy push access
  const AND = where.AND as Prisma.CampaignWhereInput[]

  if (id) AND.push({ id })
  if (slug) AND.push({ slug: { equals: slug, mode: 'insensitive' } })
  if (email) {
    AND.push({
      user: {
        email: {
          contains: email,
          mode: 'insensitive',
        },
      },
    })
  }
  if (state) AND.push(caseInsensitiveCompare('details', ['state'], state))
  if (level) AND.push(caseInsensitiveCompare('details', ['ballotLevel'], level))
  if (campaignStatus) {
    AND.push({
      isActive: campaignStatus === 'active',
    })
  }
  if (p2vStatus) {
    AND.push({
      pathToVictory: caseInsensitiveCompare('data', ['p2vStatus'], p2vStatus),
    })
  }
  if (generalElectionDateStart) {
    AND.push({
      details: {
        path: ['electionDate'],
        gte: generalElectionDateStart,
      },
    })
  }
  if (generalElectionDateEnd) {
    AND.push({
      details: {
        path: ['electionDate'],
        lte: generalElectionDateEnd,
      },
    })
  }
  if (primaryElectionDateStart) {
    AND.push({
      details: {
        path: ['primaryElectionDate'],
        gte: primaryElectionDateStart,
      },
    })
  }
  if (primaryElectionDateEnd) {
    AND.push({
      details: {
        path: ['primaryElectionDate'],
        lte: primaryElectionDateEnd,
      },
    })
  }

  return where
}
