export {}

enum WhyBrowsing {
  considering = 'considering',
  learning = 'learning',
  test = 'test',
  else = 'else',
}

declare global {
  export namespace PrismaJson {
    export type UserMetaData = {
      customerId?: string
      checkoutSessionId?: string | null
      accountType?: string
      lastVisited?: number
      isDeleted?: boolean
      fsUserId?: string
      whyBrowsing?: WhyBrowsing
      hubspotId?: string
      profile_updated_count?: number
    } | null
  }
}
