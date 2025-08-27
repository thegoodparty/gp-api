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
  title: string
  description: string
  cta: string
  flowType: string
  week?: number
  proRequired: boolean
  defaultAiTemplateId?: string
  date: string
  deadline?: number
}

export interface CampaignPlanTaskMetadata {
  generation_timestamp: string
  statistics: {
    total_tasks: number
    ai_generated_tasks: number
    static_tasks: number
    by_flow_type: Record<string, number>
    by_source: Record<string, number>
    by_week: Record<string, number>
    with_templates: number
    pro_required: number
    date_range: {
      earliest: string
      latest: string
    }
  }
}

export interface CampaignPlanResponse {
  campaign_plan: string
  candidate_name: string
  election_date: string
  office_and_jurisdiction: string
  generation_timestamp: string
  ai_tasks: CampaignPlanTask[]
  task_metadata: CampaignPlanTaskMetadata
}
