import { Campaign } from '@prisma/client'

// export interface CleanCampaign {
//   slug: string
//   id: string
//   didWin: boolean | null
//   office: string | null
//   state: string | null
//   ballotLevel: string | null
//   zip: string | null
//   party: string | null
//   firstName: string
//   lastName: string
//   avatar: string | boolean
//   electionDate: string | null
//   county: string | null
//   city: string | null
//   normalizedOffice?: string | null
//   globalPosition?: { lng: number; lat: number }
// }

export interface CleanCampaign
  extends Pick<Campaign, 'id' | 'slug' | 'didWin'> {
  // Fields extracted from the `details` JSON or custom additions
  office?: string | null
  state?: string | null
  ballotLevel?: string | null
  zip?: string | null
  party?: string | null
  firstName: string
  lastName: string
  avatar: string | boolean
  electionDate: string | null
  county?: string | null
  city?: string | null
  normalizedOffice?: string | null
  globalPosition?: { lng: number; lat: number }
}
