import { CommunityEventsResult } from 'src/campaignStrategy/schemas/communityEvents.schema'

export {}

declare global {
  export namespace PrismaJson {
    export type CampaignStrategyCommunityEvents = CommunityEventsResult
  }
}
