import { Prisma } from '@prisma/client'

export type EcanvasserWithRelations = Prisma.EcanvasserGetPayload<{
  include: {
    appointments: true
    contacts: true
    customFields: true
    documents: true
    efforts: true
    followUps: true
    houses: true
    interactions: true
    surveys: true
    questions: true
    teams: true
    users: true
    campaign: {
      select: {
        id: true
        user: {
          select: {
            email: true
          }
        }
      }
    }
  }
}>

export interface EcanvasserAppointment {
  id: number
  name: string
  description: string
  scheduled_for?: string
  status?: 'Active' | 'Done'
  created_by: number
  updated_by: number
  assigned_to: number
  canvass_id: number
  contact_id: number
  house_id: number
  created_at: string
  updated_at: string
}

export interface EcanvasserContact {
  id: number
  first_name: string
  last_name: string
  type: string
  gender?: 'Male' | 'Female' | null
  date_of_birth?: string | null
  year_of_birth?: number | null
  house_id?: number | null
  unique_identifier?: string | null
  organization?: string | null
  volunteer: boolean
  deceased: boolean
  donor: boolean
  home_phone?: string | null
  mobile_phone?: string | null
  email?: string | null
  action_id?: number | null
  last_interaction_id?: number | null
  created_by: number
  created_at: string
  updated_at: string
}

export interface EcanvasserCustomField {
  id: number
  name: string
  created_by: number
  type_id: number
  type_name: string
  default_value?: string | null
  nationbuilder_slug?: string | null
  created_at: string
  updated_at: string
}

export interface EcanvasserDocument {
  id: number
  file_name: string
  created_by: number
  file_size: number
  type: string
  created_at: string
}

export interface EcanvasserEffort {
  id: number
  description: string
  name: string
  status: 'Active' | 'Archived'
  created_by: number
  updated_by: number
  icon: string
  created_at: string
  updated_at: string
}

export interface EcanvasserFollowUp {
  id: number
  details: string
  priority: 'None' | 'Low' | 'Medium' | 'High'
  status: 'New' | 'Open' | 'Closed' | 'On-Hold' | 'Acknowledged'
  origin:
    | 'Interaction'
    | 'Phone'
    | 'E-mail'
    | 'Facebook'
    | 'Twitter'
    | 'Clinic'
    | 'Meeting'
  contact_id: number
  interaction_id?: number | null
  assigned_to?: number | null
  created_by: number
  created_at: string
  updated_at: string
}

export interface EcanvasserHouse {
  id: number
  unit?: string | null
  number?: string | null
  name?: string | null
  address: string
  city: string
  state: string
  latitude?: number | null
  longitude?: number | null
  source: string
  location_type?:
    | 'ROOFTOP'
    | 'RANGE_INTERPOLATED'
    | 'GEOMETRIC_CENTER'
    | 'APPROXIMATE'
    | 'UNKNOWN'
    | null
  last_interaction_id?: number | null
  action_id?: number | null
  building_id?: number | null
  type: string
  zip_code?: string | null
  precinct?: string | null
  notes?: string | null
  created_by: number
  created_at: string
  updated_at: string
}

export interface EcanvasserInteraction {
  id: number
  rating?: number | null
  status_id: number
  status_name: string
  status_description: string
  status_color: string
  effort_id: number
  contact_id?: number | null
  house_id?: number | null
  type: string
  action_id?: number | null
  created_by: number
  created_at: string
  updated_at: string
}

export interface EcanvasserSurvey {
  id: number
  name: string
  description: string
  requires_signature: boolean
  nationbuilder_id?: number | null
  status: 'Live' | 'Not Live'
  team_id?: number | null
  created_by: number
  created_at: string
  updated_at: string
}

export interface EcanvasserQuestion {
  id: number
  survey_id: number
  name: string
  answer_type_id: number
  answer_type_name: string
  order: number
  required: boolean
  created_at: string
  updated_at: string
}

export interface EcanvasserTeam {
  id: number
  name: string
  color: string
  created_by: number
  created_at: string
  updated_at: string
}

export interface EcanvasserUser {
  id: number
  first_name: string
  last_name: string
  permission: string
  email?: string | null
  phone_number?: string | null
  country_code?: string | null
  joined: string
  billing: boolean
  created_at: string
  updated_at: string
}

export interface EcanvasserSummary {
  appointments: number
  contacts: number
  customFields: number
  documents: number
  efforts: number
  followUps: number
  houses: number
  interactions: number
  surveys: number
  questions: number
  teams: number
  users: number
  email: string | null
  campaignId: number | undefined
  lastSync: Date | null
  error: string | null
}
