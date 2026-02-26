import { Prisma } from '@prisma/client'

export type CampaignPlanVersionData = Record<string, PlanVersion[]>

export type PlanVersion = {
  date: Date | string
  text: string
  language?: string
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
    pathToVictory: {
      select: {
        data: true
      }
    }
  }
}>

export type CampaignWithPathToVictory = Prisma.CampaignGetPayload<{
  include: {
    pathToVictory: true
  }
}>

export interface UpdateCampaignFieldsInput {
  data?: Record<string, unknown>
  details?: Record<string, unknown>
  pathToVictory?: Record<string, unknown>
  aiContent?: Record<string, unknown>
  formattedAddress?: string | null
  placeId?: string | null
  canDownloadFederal?: boolean
}
