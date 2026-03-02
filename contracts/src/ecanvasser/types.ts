export type Ecanvasser = {
  id: number
  createdAt: string
  updatedAt: string
  apiKey: string
  campaignId: number
  lastSync: string | null
  error: string | null
}

export type EcanvasserSummary = {
  contacts: number
  houses: number
  interactions: number
  email: string | null
  campaignId: number | undefined
  lastSync: string | null
  error: string | null
}
