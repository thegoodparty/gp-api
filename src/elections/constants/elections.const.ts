export const ElectionApiRoutes = {
  districts: {
    list: {
      path: 'districts/list',
    },
    types: {
      path: 'districts/types',
    },
    names: {
      path: 'districts/names',
    },
  },
  projectedTurnout: {
    find: {
      path: 'projectedTurnout',
    },
  },
  positions: {
    findByBrId: {
      path: 'positions/by-ballotready-id',
    },
    findById: {
      path: 'positions',
    },
  },
  races: {
    filingFeeByBrHashId: {
      // Resolves filing fee directly from the Race table by BallotReady
      // race hash. Used when `campaign.details.raceId` is set (the hash
      // gp-webapp persists on every onboarded candidate). Bypasses the
      // Position → Place → Race join that depends on Position.placeId
      // being populated (which it isn't today).
      // Full path: /races/by-br-hash-id/:brHashId/filing-fee
      path: 'races/by-br-hash-id',
      filingFeeSuffix: 'filing-fee',
    },
  },
}
