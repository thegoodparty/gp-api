import { VoterGoals } from '../../campaigns/campaigns.types'

export const calculateVoterGoalsCount = (voterGoals: VoterGoals = {}) =>
  Object.values(voterGoals || {}).reduce(
    (n, v) => (!isNaN(v) ? n + parseInt(`${v}`) : n),
    0,
  )
export const generateAiContentTrackingFlags = (aiContent?: {}) =>
  Object.keys(aiContent || {}).reduce(
    (acc, key) => ({
      ...acc,
      [`ai-content-${key}`]: true,
    }),
    {},
  )
