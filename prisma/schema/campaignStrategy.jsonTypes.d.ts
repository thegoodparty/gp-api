import { CommunityEventsResult } from '@goodparty_org/contracts'

export {}

declare global {
  export namespace PrismaJson {
    export type CampaignStrategyCommunityEvents = CommunityEventsResult
  }
}
