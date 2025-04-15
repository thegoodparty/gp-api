import { Campaign } from '@prisma/client'
import { parseIsoDateString } from '../../shared/util/date.util'

// TODO: We should figure out how to convert these to Date objects in Prisma instead of needing a util method here.
export const parseCampaignElectionDate = (campaign: Campaign) => {
  const { details } = campaign
  const { electionDate: electionDateStr } = details || {}
  return electionDateStr && parseIsoDateString(electionDateStr)
}
