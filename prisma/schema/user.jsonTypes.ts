export {}

declare global {
  export namespace PrismaJson {
    export type UserMetaData = {
      customerId?: string
      checkoutSessionId?: string | null
      accountType?: string
      lastVisited?: number
    } | null
  }
}
