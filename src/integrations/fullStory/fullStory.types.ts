import { Campaign, PathToVictory, User } from '@prisma/client'

export interface TrackUserArgs {
  user: User
  campaign?: Campaign
  pathToVictory?: PathToVictory
  // TODO: need to add CRM company data here once HubSpot integration is complete
  // crmCompany?: CrmCompany
}
