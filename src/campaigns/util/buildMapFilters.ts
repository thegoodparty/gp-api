import { Prisma } from '@prisma/client'
import { capitalizeFirstLetter } from 'src/shared/util/strings.util'
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
    // Prisma doesn't support case-insensitive searching inside JSON
    const partyCondition = createJsonOrConditionString(partyFilter, ['party'])
    if (partyCondition) {
      andConditions.push(partyCondition)
    }
  }

  if (stateFilter) {
    andConditions.push({
      details: {
        path: ['state'],
        string_contains: stateFilter,
      },
    })
  }

  if (levelFilter) {
    const levelCondition = createJsonOrConditionString(levelFilter, [
      'ballotLevel',
    ])
    if (levelCondition) {
      andConditions.push(levelCondition)
    }
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
    const officeCondition = createJsonOrConditionString(officeFilter, [
      ['normalizedOffice'],
      ['office'],
      ['otherOffice'],
    ])
    if (officeCondition) {
      andConditions.push(officeCondition)
    }
  }

  // Exclude campaigns without ZIP
  andConditions.push({
    details: {
      path: ['zip'],
      not: { equals: null },
    },
  })

  if (IS_PROD) {
    const isProdCondition = createJsonOrConditionString('Yes', [
      'hubSpotUpdates',
      'verified_candidates',
    ])
    if (isProdCondition) {
      isProdCondition.OR.push({
        isVerified: true,
      })

      andConditions.push(isProdCondition)
    }
  }

  return andConditions
}

function createJsonOrConditionString(
  filter: string,
  paths: string[] | string[][],
): { OR: Prisma.CampaignWhereInput[] } | null {
  if (!filter) return null

  const filterUpper = capitalizeFirstLetter(filter).trim()
  const filterLower = filter.toLowerCase().trim()

  const normalizedPaths = Array.isArray(paths[0])
    ? (paths as string[][])
    : [paths as string[]]

  const orConditions = normalizedPaths
    .map((path) => [
      {
        details: {
          path: path,
          string_contains: filterUpper,
        },
      },
      {
        details: {
          path: path,
          string_contains: filterLower,
        },
      },
      {
        details: {
          path: path,
          string_contains: filter,
        },
      },
    ])
    .flat()

  return {
    OR: orConditions,
  }
}
