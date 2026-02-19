import { WhyBrowsing } from '@/users/schemas/UserMetaData.schema'

declare global {
  export namespace PrismaJson {
    export type UserMetaData = {
      customerId?: string
      checkoutSessionId?: string | null
      accountType?: string | null
      lastVisited?: number
      sessionCount?: number
      isDeleted?: boolean
      fsUserId?: string
      whyBrowsing?: WhyBrowsing | null
      hubspotId?: string
      profile_updated_count?: number
      textNotifications?: boolean
    } | null
  }
}
