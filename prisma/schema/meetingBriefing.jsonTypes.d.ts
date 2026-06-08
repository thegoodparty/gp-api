import { Prisma } from '../../src/generated/prisma'

export {}

declare global {
  export namespace PrismaJson {
    export type MeetingBriefingArtifact = {
      briefing_status?:
        | 'briefing_ready'
        | 'agenda_provided_by_user'
        | 'awaiting_agenda'
        | 'no_meeting_found'
        | 'error'
      meeting_date?: string
      meeting_time?: string
      meeting_timezone?: string
      meeting_name?: string
      location?: string
      [key: string]: Prisma.JsonValue | undefined
    }
  }
}
