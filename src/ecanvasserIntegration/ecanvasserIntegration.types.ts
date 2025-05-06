export interface EcanvasserSummary {
  contacts: number
  houses: number
  interactions: number
  email: string | null
  campaignId: number | undefined
  lastSync: Date | null
  error: string | null
}

// API Response Types (snake_case)
export interface ApiEcanvasserContact {
  first_name: string
  last_name: string
  type: string
  gender?: string
  date_of_birth?: string
  year_of_birth?: number
  house_id?: number
  unique_identifier?: string
  organization?: string
  volunteer: boolean
  deceased: boolean
  donor: boolean
  contact_details: {
    home?: string
    mobile?: string
    email?: string
  }
  action_id?: number
  last_interaction_id?: number
  created_by: number
}

export interface ApiEcanvasserInteraction {
  id: number
  type: string
  status: {
    name: string
  }
  rating?: number
  contact_id?: number
  created_by: number
  created_at: string
}

export interface PaginationParams {
  limit?: number
  order?: 'asc' | 'desc'
  after_id?: number
  before_id?: number
  start_date?: string
}

export interface ApiResponse<T> {
  success: boolean
  data: T[]
  meta: {
    count: number
    per_page: number
    ids: {
      first: number
      last: number
    }
    links: {
      next?: string
      prev?: string
      self: string
    }
  }
  message?: string
}

export interface ApiEcanvasserSurvey {
  created_by: number
  created_at: string
  updated_at: string
  id: number
  name: string
  description: string
  requires_signature: boolean
  status: 'Live' | 'Not Live'
  team_id: number | null
  questions: ApiEcanvasserSurveyQuestion[]
}

export interface ApiEcanvasserSurveyQuestion {
  id: number
  survey_id: number
  name: string
  answer_type: {
    id: number
    name: string
  }
  order: number
  required: boolean
  created_at: string
  updated_at: string
  answers?: Array<{
    name: string
  }>
}

export interface ApiEcanvasserHouse {
  id: number
  unit: string
  number: string
  name: string
  address: string
  city: string
  state: string
  latitude: number
  longitude: number
  source: string
  location_type: string
  last_interaction_id: number
  action_id: number | null
  building_id: number | null
  type: string
  zip_code: string
  precinct: string
  notes: string
  created_by: number
  created_at: string
  updated_at: string
}

export interface ApiEcanvasserTeam {
  id: number
  name: string
  color: string
  created_by: number
  created_at: string
  updated_at: string
}
