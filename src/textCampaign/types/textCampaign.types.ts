export interface TextCampaignSummary {
  projectId: string | null
  name: string | null
  message: string | null
  campaignId: number | undefined
  error: string | null
  status?: string
}

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

export interface CreateProjectResponse {
  success: boolean
  data?: {
    id: string
    name: string
    message: string
    projectId: string
  }
  error?: string
  message?: string
}

export interface PaginationParams {
  limit?: number
  order?: 'asc' | 'desc'
  page?: number
  offset?: number
}

export interface ProjectDto {
  id: string
  name: string
  message: string
  areaCode: string
  groupId: string
  flags: string
  outsourceStart: string
  outsourceEnd: string
  outsourceEmail: string
  createdAt: string
  updatedAt: string
}
