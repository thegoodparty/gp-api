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
  campaignStrategyContext: {
    // POST /campaign-strategy-context — looks up a Race by br_hash_id and
    // returns voter counts, candidate roster, win-number variants, and
    // election dates. The single source for raceTargetMetrics now that
    // election-api PR #176 widened District with L2-derived voter stats.
    path: 'campaign-strategy-context',
  },
}
