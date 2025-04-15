import { Campaign } from '@prisma/client'
import { parse } from 'date-fns'
import { DateFormats } from '../../shared/util/date.util'

// TODO: We should figure out how to convert these to Date objects in Prisma instead of needing a util method here.
export const parseCampaignElectionDate = (campaign: Campaign) => {
  const { details } = campaign
  const { electionDate: electionDateStr } = details || {}
  return (
    electionDateStr && parse(electionDateStr!, DateFormats.isoDate, new Date())
  )
}
