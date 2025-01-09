export {}

declare global {
  export namespace PrismaJson {
    export type UserMetaData = {
      customerId?: string
      checkoutSessionId?: string | null
    } | null
  }
}
