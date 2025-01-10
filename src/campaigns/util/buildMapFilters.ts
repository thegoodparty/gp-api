import { Prisma } from '@prisma/client'
import { capitalizeFirstLetter } from 'src/shared/util/strings.util'

interface FilterParams {
  partyFilter?: string
  stateFilter?: string
  levelFilter?: string
  resultsFilter?: boolean
  officeFilter?: string
  nameFilter?: string
  forceReCalc?: boolean
  isProd?: boolean
}

export function buildMapFilters(
  params: FilterParams,
): Prisma.CampaignWhereInput[] {
  const {
    partyFilter,
    stateFilter,
    levelFilter,
    resultsFilter,
    officeFilter,
    isProd = false,
  } = params

  const andConditions: Prisma.CampaignWhereInput[] = []

  if (partyFilter) {
    // Prisma doesn't support case-insensitive searching inside JSON
    const partyCondition = createJsonOrConditionString(partyFilter, ['party'])
    if (partyCondition) {
      andConditions.push(partyCondition)
    }
  }

  if (stateFilter) {
    const stateCondition = createJsonOrConditionString(stateFilter, ['state'])
    if (stateCondition) {
      andConditions.push(stateCondition)
    }
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

  if (isProd) {
    andConditions.push({
      data: {
        path: ['hubSpotUpdates', 'verified_candidates'],
        equals: 'Yes',
      },
    })
  }

  // Exclude campaigns without ZIP and where didWin is false
  andConditions.push({
    details: {
      path: ['zip'],
      not: { equals: null },
    },
    didWin: {
      not: false,
    },
  })

  if (isProd) {
    const isProdCondition = createJsonOrConditionString('Yes', [
      'hubSpotUpdates',
      'verified_candidates',
    ])
    if (isProdCondition) {
      andConditions.push(isProdCondition)
    }
  }

  return andConditions
}

function createJsonOrConditionString(
  filter: string,
  paths: string[] | string[][],
): Prisma.CampaignWhereInput | null {
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
    ])
    .flat()

  return {
    OR: orConditions,
  }
}
