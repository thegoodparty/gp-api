export type ElectedOffice = {
  id: string
  organizationSlug: string | null
  electedDate: string | null
  swornInDate: string | null
  termStartDate: string | null
  termEndDate: string | null
  termLengthDays: number | null
  isActive: boolean
  userId: number
  campaignId: number
  createdAt: string
  updatedAt: string
}
