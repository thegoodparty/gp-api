import { Prisma } from '@prisma/client'

interface FilterParams {
  party?: string
  state?: string
  level?: string
  results?: boolean
  office?: string
  name?: string
  forceReCalc?: boolean
  isProd?: boolean
}

export function buildMapFilters(
  params: FilterParams,
): Prisma.CampaignWhereInput[] {
  const { party, state, level, results, office, isProd = false } = params

  const andConditions: Prisma.CampaignWhereInput[] = []

  if (party) {
    andConditions.push({
      details: {
        path: ['party'],
        string_contains: party.toLowerCase(),
      },
    })
  }

  if (state) {
    andConditions.push({
      details: {
        path: ['state'],
        equals: state,
      },
    })
  }

  if (level) {
    andConditions.push({
      details: {
        path: ['ballotLevel'],
        equals: level,
      },
    })
  }

  if (results) {
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

  if (office) {
    andConditions.push({
      OR: [
        {
          details: {
            path: ['normalizedOffice'],
            equals: office,
          },
        },
        {
          details: {
            path: ['office'],
            equals: office,
          },
        },
        {
          details: {
            path: ['otherOffice'],
            equals: office,
          },
        },
      ],
    })
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
    andConditions.push({
      data: {
        path: ['hubSpotUpdates', 'verified_candidates'],
        equals: 'Yes',
      },
    })
  }

  return andConditions
}
