export {}

declare global {
  export namespace PrismaJson {
    export interface WebsiteContent {
      campaignName?: string
      logo?: string
      theme?: string
      main?: {
        title?: string
        tagline?: string
        image?: string
      }
      about?: {
        bio?: string
        issues?: Array<{
          title?: string
          description?: string
        }>
      }
      contact?: {
        address?: string
        email?: string
        phone?: string
      }
    }
  }
}
