import { Prisma } from '@prisma/client'

export {}

declare global {
  export namespace PrismaJson {
    export type MeetingBriefingArtifact = {
      meeting_date?: string
      meeting_name?: string
      location?: string
      [key: string]: Prisma.JsonValue | undefined
    }
  }
}
