import { Prisma } from '@prisma/client'

/**
 * Fields formerly stored on CampaignDetails, now managed by Organization.
 * Still accepted in incoming API requests (via Zod .passthrough()) for
 * org resolution, and may exist in historical DB rows.
 */
export type OrgManagedCampaignFields = {
  positionId?: string | null
  office?: string | null
  otherOffice?: string | null
}

/**
 * CampaignDetails as received in incoming API requests — includes
 * org-managed fields that are consumed for resolution but stripped
 * before persistence.
 */
export type IncomingCampaignDetails = PrismaJson.CampaignDetails &
  OrgManagedCampaignFields

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
  overrideDistrictId?: string | null
}
