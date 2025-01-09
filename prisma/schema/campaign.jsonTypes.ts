import { User } from '@prisma/client'

export {}

declare global {
  export namespace PrismaJson {
    export type CampaignDetails = {
      state?: string
      ballotLevel?: string
      electionDate?: string
      primaryElectionDate?: string
      zip?: User['zip']
      knowRun?: 'yes' | null
      pledged?: boolean
      isProUpdatedAt?: number // TODO: make this an ISO dateTime string
      office?: string
      otherOffice?: string
    }
  }
}
