import { Prisma } from '@prisma/client'

export type CampaignPlanVersionData = Record<string, PlanVersion[]>

export type PlanVersion = {
  date: string
  text: string
  language?: string
  inputValues?: unknown
}

export type CampaignWith<T extends keyof Prisma.CampaignInclude> =
  Prisma.CampaignGetPayload<{ include: { [field in T]: true } }>

export type CampaignListResponse = Prisma.CampaignGetPayload<{
  include: {
    user: {
      select: {
        firstName: true
        lastName: true
        phone: true
        email: true
        metaData: true
      }
    }
  }
}>

export interface UpdateCampaignFieldsInput {
  data?: Record<string, unknown>
  details?: Record<string, unknown>
  aiContent?: Record<string, unknown>
  formattedAddress?: string | null
  placeId?: string | null
  canDownloadFederal?: boolean
  overrideDistrictId?: string | null
}
