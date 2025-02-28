import { Campaign, CampaignPosition } from '@prisma/client'
import { VoterGoals } from '../../campaigns/campaigns.types'

export const calculateVoterGoalsCount = (voterGoals: VoterGoals = {}) =>
  Object.values(voterGoals || {}).reduce(
    (n, v) => (!isNaN(v) ? n + parseInt(`${v}`) : n),
    0,
  )
export const generateAiContentTrackingFlags = (aiContent?: object) =>
  Object.keys(aiContent || {}).reduce(
    (acc, key) => ({
      ...acc,
      [`ai-content-${key}`]: true,
    }),
    {},
  )

// NOTE: this was copy/pasted from frontend
export const countAnsweredQuestions = (
  campaign: Campaign,
  candidatePositions: CampaignPosition[],
) => {
  const totalQuestions = 6
  let answeredQuestions = 0
  const {
    customIssues,
    occupation,
    funFact,
    pastExperience,
    website,
    runningAgainst,
  } = campaign?.details || {}
  const issuesCount =
    (customIssues?.length || 0) + candidatePositions?.length || 0
  if (campaign?.details) {
    if (occupation) {
      answeredQuestions++
    }
    if (funFact) {
      answeredQuestions++
    }
    if (pastExperience) {
      answeredQuestions++
    }
    if (issuesCount >= 3) {
      answeredQuestions++
    }
    if (website) {
      answeredQuestions++
    }
    if (runningAgainst) {
      answeredQuestions++
    }
  }
  return { answeredQuestions, totalQuestions }
}
