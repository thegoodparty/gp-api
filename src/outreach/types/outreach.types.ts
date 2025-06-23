import { Prisma } from '@prisma/client'

export interface ApiRumbleUpProject {
  name: string
  msg: string
  areacode: string
  group?: string
  group_file?: string
  tcr_cid?: string
  tcr_phone?: string | 'All'
  flags?: string
  media?: string
  outsource_start?: string // Format: YYYY-MM-DDTHH:MM:SS±HH:MM
  outsource_end?: string // Format: YYYY-MM-DDTHH:MM:SS±HH:MM
  outsource_email?: string
  outsource_contact?: string
  outsource_notes?: string
  shorturl_domain?: string
  shorturl_tracking?: boolean
}

export interface ApiRumbleUpResponse {
  success: boolean
  data?: {
    id: string
  }
  message?: string
  gid?: string
  error?: string
  error_code?: string
}

export type OutreachWithVoterFileFilter = Prisma.OutreachGetPayload<{
  include: {
    voterFileFilter: true
  }
}>
