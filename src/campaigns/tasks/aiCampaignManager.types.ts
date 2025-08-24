import { CampaignTaskType } from '@prisma/client'

export interface StartCampaignPlanRequest {
  candidate_name: string
  election_date: string
  office_and_jurisdiction: string
  race_type: string
  incumbent_status: string
  seats_available: number
  number_of_opponents: number
  win_number: number
  total_likely_voters: number
  available_cell_phones: number
  available_landlines: number
  primary_date?: string | null
  additional_race_context?: string | null
}

export interface CampaignPlanSession {
  session_id: string
}

export interface ProgressStreamData {
  progress: number
  status: 'processing' | 'completed' | 'failed'
  message: string
  logs: string[]
  timestamp: string
  has_pdf: boolean
  has_json: boolean
  download_links: {
    pdf?: string
    json?: string
  }
  expires_at: string | null
  expires_at_formatted: string | null
  files_ready: {
    pdf: boolean
    json: boolean
    total: number
  }
}

export interface CampaignPlanTask {
  date: string
  parsed_date: string | null
  title: string
  description: string
  category: CampaignTaskType
  cta: string
  link: string | null
  pro_required: boolean
  deadline: number | null
  defaultAiTemplateId: string | null
}

export interface CampaignPlanSections {
  overview: string
  strategic_landscape_electoral_goals: string
  campaign_timeline: string
  recommended_total_budget: string
  know_your_community: string
  voter_contact_plan: string
}

export interface CampaignPlanTasks {
  timeline: CampaignPlanTask[]
  voter_contact: CampaignPlanTask[]
  all_tasks: CampaignPlanTask[]
  total_count: number
}

export interface CampaignPlanMetadata {
  format_version: string
  extraction_date: string
  sections_count: number
  total_tasks: number
}

export interface CampaignPlanResponse {
  campaign_info: {
    candidate_name: string
    office_and_jurisdiction: string
    election_date: string
    primary_date: string | null
    race_type: string
    incumbent_status: string
    seats_available: number
    number_of_opponents: number
    win_number: number
    total_likely_voters: number
    available_cell_phones: number
    available_landlines: number
    additional_race_context: string
    generated_date: string
  }
  sections: CampaignPlanSections
  tasks: CampaignPlanTasks
  metadata: CampaignPlanMetadata
}

export interface ApiRequestOptions {
  method?: string
  data?: StartCampaignPlanRequest | null
  headers?: Record<string, string>
}
