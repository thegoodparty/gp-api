export {}

// TODO: figure out if it's possible to collocate these Json types with the
//  models they're associated with
declare global {
  export namespace PrismaJson {
    type UserMetaData = {
      customerId?: string
      checkoutSessionId?: string
    } | null
  }
}
