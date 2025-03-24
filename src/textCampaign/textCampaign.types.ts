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
  group: string
  flags: string
  outsource_start: string
  outsource_end: string
  outsource_email: string
}

export interface ApiRumbleUpResponse {
  success: boolean
  data?: any
  message?: string
  error?: string
}

export interface CreateProjectResponse {
  success: boolean
  data?: any
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
