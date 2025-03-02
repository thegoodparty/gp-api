import { Prisma } from '@prisma/client'
import { IS_PROD } from 'src/shared/util/appEnvironment.util'

const WINNERS_ELECTION_YEAR = process.env.WINNERS_ELECTION_YEAR

if (!WINNERS_ELECTION_YEAR) {
  throw new Error('Please set WINNERS_ELECTION_YEAR in your .env')
}

interface FilterParams {
  partyFilter?: string
  stateFilter?: string
  levelFilter?: string
  resultsFilter?: boolean
  officeFilter?: string
  nameFilter?: string
  forceReCalc?: boolean
}

export function buildMapFilters(
  params: FilterParams,
): Prisma.CampaignWhereInput[] {
  const { partyFilter, stateFilter, levelFilter, resultsFilter, officeFilter } =
    params

  const andConditions: Prisma.CampaignWhereInput[] = []

  if (partyFilter) {
    andConditions.push({
      details: {
        path: ['party'],
        string_contains: partyFilter,
        mode: 'insensitive',
      },
    })
  }

  if (stateFilter) {
    andConditions.push({
      details: {
        path: ['state'],
        string_contains: stateFilter,
        mode: 'insensitive',
      },
    })
  }

  if (levelFilter) {
    andConditions.push({
      details: {
        path: ['ballotLevel'],
        string_contains: levelFilter,
        mode: 'insensitive',
      },
    })
  }

  if (resultsFilter) {
    andConditions.push({
      OR: [
        { didWin: true },
        {
          data: {
            path: ['hubSpotUpdates', 'election_results'],
            equals: 'Won General',
          },
        },
      ],
    })
  }

  andConditions.push({
    details: {
      path: ['electionDate'],
      string_contains: `${WINNERS_ELECTION_YEAR}`,
    },
  })

  if (officeFilter) {
    andConditions.push({
      OR: [
        {
          details: {
            path: ['normalizedOffice'],
            string_contains: officeFilter,
            mode: 'insensitive',
          },
        },
        {
          details: {
            path: ['office'],
            string_contains: officeFilter,
            mode: 'insensitive',
          },
        },
        {
          details: {
            path: ['otherOffice'],
            string_contains: officeFilter,
          },
        },
      ],
    })
  }

  // Exclude campaigns without ZIP
  andConditions.push({
    details: {
      path: ['zip'],
      not: { equals: null },
    },
  })

  if (IS_PROD) {
    andConditions.push({
      OR: [
        {
          isVerified: true,
        },
        {
          data: {
            path: ['hubSpotUpdates', 'verified_candidates'],
            equals: 'Yes',
            mode: 'insensitive',
          },
        },
      ],
    })
  }

  return andConditions
}
