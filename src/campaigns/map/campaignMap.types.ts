import { Campaign } from '@prisma/client'

export interface MapCampaign extends Pick<Campaign, 'id' | 'slug' | 'didWin'> {
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
