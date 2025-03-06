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
  teams: number
  users: number
  email: string | null
  campaignId: number | undefined
  lastSync: Date | null
  error: string | null
}

export interface EcanvasserContact {
  id: number
  first_name: string
  last_name: string
  type: string
  gender?: string | null
  date_of_birth?: string | null
  year_of_birth?: number | null
  house_id?: number | null
  unique_identifier?: string | null
  organization?: string | null
  volunteer: boolean
  deceased: boolean
  donor: boolean
  contact_details: {
    email: string | null
    home: string | null
    mobile: string | null
  }
  action_id?: number | null
  last_interaction_id?: number | null
  created_by: number
  created_at: string
  updated_at: string
  customFields?: Array<any>
}

export interface EcanvasserCustomField {
  id: number
  name: string
  created_by: number
  type: {
    id: number
    name: string
  }
  options: any[]
  default: string | null
  nationbuilder_slug: string | null
  created_at: string
  updated_at: string
}

export interface EcanvasserInteraction {
  id: number
  rating?: number | null
  status: {
    id: number
    name: string
    description: string
    color: string
  }
  effort_id: number
  contact_id?: number | null
  house_id?: number | null
  type: string
  action_id?: number | null
  created_by: number
  created_at: string
  updated_at: string
  survey?: {
    id: number
    name: string
    description: string
    status: string
    created_by: number
    updated_at: string
    created_at: string
    nationbuilder_id: number | null
    team_id: number | null
    requires_signature: boolean
    responses: any[]
  } | null
}

// API Response Types (snake_case)
export interface ApiEcanvasserContact {
  id: number
  first_name: string
  last_name: string
  type: string
  gender?: string | null
  date_of_birth?: string | null
  year_of_birth?: number | null
  house_id?: number | null
  unique_identifier?: string | null
  organization?: string | null
  volunteer: boolean
  deceased: boolean
  donor: boolean
  contact_details: {
    email: string | null
    home: string | null
    mobile: string | null
  }
  action_id?: number | null
  last_interaction_id?: number | null
  created_by: number
  created_at: string
  updated_at: string
  customFields?: Array<any>
}

export interface ApiEcanvasserCustomField {
  id: number
  name: string
  created_by: number
  type: {
    id: number
    name: string
  }
  options: any[]
  default: string | null
  nationbuilder_slug: string | null
  created_at: string
  updated_at: string
}

export interface ApiEcanvasserInteraction {
  id: number
  rating?: number | null
  status: {
    id: number
    name: string
    description: string
    color: string
  }
  effort_id: number
  contact_id?: number | null
  house_id?: number | null
  type: string
  action_id?: number | null
  created_by: number
  created_at: string
  updated_at: string
  survey?: {
    id: number
    name: string
    description: string
    status: string
    created_by: number
    updated_at: string
    created_at: string
    nationbuilder_id: number | null
    team_id: number | null
    requires_signature: boolean
    responses: any[]
  } | null
}

// Add other API response types as needed...
