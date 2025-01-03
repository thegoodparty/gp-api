import { Campaign as PrismaCampaign } from '@prisma/client'

type NestedRecords = Record<
  string,
  string | Record<string, string | Record<string, string>>
>

export type CampaignAiContent = NestedRecords
export type CampaignDataContent = NestedRecords & {
  createdBy?: 'admin' | string
  hubSpotUpdates?: {
    verified_candidates?: string
    election_results?: string
    office_type?: string
  }
}

export type CampaignDetailsContent = NestedRecords & {
  geoLocation?: {
    lng?: string
  }
  geoLocationFailed?: string
  zip?: string
  electionDate?: string
  party?: string
  state?: string
  ballotLevel?: string
}

export type Campaign = PrismaCampaign & {
  aiContent?: CampaignAiContent
  data?: CampaignDataContent
  details?: CampaignDetailsContent
}

export function isRecord<T extends object>(
  value: unknown,
): value is Record<string, T> {
  return typeof value === 'object' && value !== null
}

export interface CleanCampaign {
  slug: string
  id: string
  didWin: boolean | null
  office: string | null
  state: string | null
  ballotLevel: string | null
  zip: string | null
  party: string | null
  firstName: string
  lastName: string
  avatar: string | boolean
  electionDate: string | null
  county?: string
  city?: string
  normalizedOffice?: string
}
