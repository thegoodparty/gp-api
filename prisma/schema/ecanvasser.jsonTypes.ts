export {}

declare global {
  export namespace PrismaJson {
    export type EcanvasserAppointments = Array<{
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
    }>

    export type EcanvasserContacts = Array<{
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
      contact_details: {
        home?: string
        mobile?: string
        email?: string
      }
      custom_fields: Array<{
        value: string
        id: number
        nationbuilder_slug?: string
        type: {
          id: number
          name: string
        }
      }>
      action_id?: number | null
      last_interaction_id?: number | null
      created_by: number
      created_at: string
      updated_at: string
    }>

    export type EcanvasserCustomFields = Array<{
      id: number
      name: string
      created_by: number
      type: {
        id: number
        name: string
      }
      default?: string | null
      options: Array<{
        id: number
        name: string
        nationbuilder_id?: number
      }>
      nationbuilder_slug?: string | null
      created_at: string
      updated_at: string
    }>

    export type EcanvasserDocuments = Array<{
      id: number
      file_name: string
      created_by: number
      file_size: number
      type: string
      created_at: string
    }>

    export type EcanvasserEfforts = Array<{
      id: number
      description: string
      name: string
      status: 'Active' | 'Archived'
      created_by: number
      updated_by: number
      icon: string
      created_at: string
      updated_at: string
    }>

    export type EcanvasserFollowUpRequests = Array<{
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
    }>

    export type EcanvasserHouses = Array<{
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
    }>

    export type EcanvasserInteractions = Array<{
      id: number
      rating?: number | null
      status: {
        id: number
        name: string
        description: string
        color: string
      }
      effort_id: number
      contact_id?: number
      house_id?: number
      survey?: {
        id: number
        name: string
        description: string
        requires_signature: boolean
        nationbuilder_id?: number | null
        status: 'Live' | 'Not Live'
        team_id?: number | null
        responses: Array<{
          question: {
            id: number
            name: string
            answer_type: {
              id: number
              name: string
            }
            order: number
            required: boolean
          }
          answer: {
            name: string
            nationbuilder_id?: number
          }
          created_at: string
        }>
      } | null
      follow_up_request?: {
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
        assigned_to?: number | null
        created_by: number
        created_at: string
        updated_at: string
      } | null
      location?: {
        latitude: string
        longitude: string
        distance: number
        accuracy: number
      } | null
      type: string
      action_id?: number | null
      created_by: number
      created_at: string
      updated_at: string
    }>

    export type EcanvasserSurveys = Array<{
      id: number
      name: string
      description: string
      requires_signature: boolean
      nationbuilder_id?: number | null
      status: 'Live' | 'Not Live'
      team_id?: number | null
      questions: Array<{
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
      }>
      created_by: number
      created_at: string
      updated_at: string
    }>

    export type EcanvasserSurveyQuestions = Array<{
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
    }>

    export type EcanvasserTeams = Array<{
      id: number
      name: string
      color: string
      created_by: number
      created_at: string
      updated_at: string
    }>

    export type EcanvasserUsers = Array<{
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
    }>
  }
}
