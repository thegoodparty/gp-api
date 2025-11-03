import { BasePurchaseMetadata } from 'src/payments/purchase.types'

export interface PollPurchaseMetadata extends BasePurchaseMetadata {
  pollId: string
  count: string
}
// temporary type for backfilling individual messages
export interface PollToBackfill {
  email: string
  name: string
  pollId: string
  csvUrl: string
}

export interface PollIndividualMessageToBackfill {
  id: string
  firstName: string
  lastName: string
  gender: string
  age: string
  politicalParty: string
  registeredVoter: string
  activeVoter: string
  voterStatus: string
  address: string
}
