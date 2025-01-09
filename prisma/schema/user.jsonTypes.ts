export {}

declare global {
  export namespace PrismaJson {
    export type UserMetaData = {
      customerId?: string
      checkoutSessionId?: string
      accountType?: string
      lastVisited?: number
    } | null
  }
}
