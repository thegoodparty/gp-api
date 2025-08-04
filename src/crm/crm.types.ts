export enum PrimaryElectionResult {
  WON = 'Won Primary',
  LOST = 'Lost Primary',
  WITHDREW = 'Withdrew',
  NOT_ON_BALLOT = 'Not on Ballot',
}

export type CRMContactProperties = {
  firstname?: string
  lastname?: string
  email?: string
  phone?: string
  type: 'Campaign'
  active_candidate?: 'Yes' | 'No'
  live_candidate?: 'true' | 'false'
  source: string
  zip?: string
  signup_role?: string
  product_user?: 'yes'
  browsing_intent?: string
  last_login?: string //DateString
  profile_updated_date?: string //DateString
  profile_updated_count?: string
}

/** HubSpot related types and enums */
export namespace HubSpot {
  /** Hubspot webhook payload */
  export type ObjectUpdate = {
    /**
     * HubSpot object ID (typically numeric ID as string)
     */
    objectId: number
    /**
     * Property name in HubSpot's property registry
     */
    propertyName: IncomingProperty
    /**
     * New value for the property
     */
    propertyValue: string
    /**
     * Source category of the change
     * @see https://knowledge.hubspot.com/properties/hubspots-change-sources
     */
    changeSource: ChangeSource
    /**
     * ID of your HubSpot app receiving the webhook
     */
    appId: number
    /**
     * ID of app integration that made the change
     * If we are the source of the change appId will match sourceId
     */
    sourceId: string
  }

  export enum ChangeSource {
    INTEGRATION = 'INTEGRATION',
  }

  /** pro_subscription_status values */
  export enum ProSubStatus {
    ACTIVE = 'Active',
    INACTIVE = 'Inactive',
  }

  /** verified_candidates values */
  export enum VerifiedCandidate {
    YES = 'yes',
    NO = 'no',
  }

  /** election_results values */
  export enum ElectionResult {
    WON_GENERAL = 'won general',
    LOST_GENERAL = 'lost general',
  }

  /** created_by_admin values */
  export enum CreatedByAdmin {
    YES = 'yes',
    NO = 'no',
  }

  /** pledge_status values */
  export enum PledgeStatus {
    YES = 'yes',
    NO = 'no',
  }

  /** pro_candidate values */
  export enum ProCandidate {
    YES = 'Yes',
    NO = 'No',
  }

  export enum Running {
    YES = 'yes',
    NO = 'no',
  }

  /** voter_data_adoption values */
  export enum VoterDataAdoption {
    LOCKED = 'Locked',
    UNLOCKED = 'Unlocked',
  }

  /**
   * Hubspot property names that we recieve from Hubspot via webhook or sync pulls
   */
  export enum IncomingProperty {
    /** Not used? Only displayed in Admin UI */
    past_candidate = 'past_candidate',
    incumbent = 'incumbent', // TODO: new viability calculates this automatically, but we may still need to incorporate this
    candidate_experience_level = 'candidate_experience_level',
    final_viability_rating = 'final_viability_rating', // TODO: this is used to also show a special callout message for text campaign scheduling. DEPRECATE THIS FIELD for new viability?
    professional_experience = 'professional_experience',
    p2p_campaigns = 'p2p_campaigns',
    p2p_sent = 'p2p_sent',
    confirmed_self_filer = 'confirmed_self_filer',
    date_verified = 'date_verified',
    number_of_opponents = 'number_of_opponents', // TODO: New viability calculates this automatically, we may not need to pull this in
    /** end not used */
    primary_election_result = 'primary_election_result',
    election_results = 'election_results',
    verified_candidates = 'verified_candidates',

    // hubspot_owner_id + office_type only comes from sync pulls, not webhooks
    hubspot_owner_id = 'hubspot_owner_id',
    office_type = 'office_type',
  }

  /**
   * Hubspot property names that we send to Hubspot via app integration
   */
  export enum OutgoingProperty {
    // voter contact numbers
    calls_made = 'calls_made',
    direct_mail_sent = 'direct_mail_sent',
    event_impressions = 'event_impressions',
    knocked_doors = 'knocked_doors',
    doors_knocked = 'doors_knocked',
    online_impressions = 'online_impressions',
    yard_signs_impressions = 'yard_signs_impressions',
    // p2p_texts = 'p2p_texts', TODO: we need a new field in HS for sms text contact numbers
    ecanvasser_contacts_count = 'ecanvasser_contacts_count',
    ecanvasser_houses_count = 'ecanvasser_houses_count',

    // candidate details
    candidate_district = 'candidate_district',
    candidate_email = 'candidate_email',
    name = 'name', // HS Company name field
    candidate_name = 'candidate_name',
    candidate_office = 'candidate_office',
    office_level = 'office_level',
    candidate_party = 'candidate_party',
    candidate_state = 'candidate_state',
    state = 'state',
    city = 'city',
    zip = 'zip',
    created_by_admin = 'created_by_admin',
    admin_user = 'admin_user',
    pledge_status = 'pledge_status',
    pro_candidate = 'pro_candidate',
    pro_subscription_status = 'pro_subscription_status',
    pro_upgrade_date = 'pro_upgrade_date',
    running = 'running',

    // election details
    br_position_id = 'br_position_id',
    br_race_id = 'br_race_id',
    election_date = 'election_date',
    filing_deadline = 'filing_deadline',
    filing_end = 'filing_end',
    filing_start = 'filing_start',
    primary_date = 'primary_date',

    // usage details
    last_portal_visit = 'last_portal_visit',
    last_step = 'last_step',
    last_step_date = 'last_step_date',
    campaign_assistant_chats = 'campaign_assistant_chats',
    my_content_pieces_created = 'my_content_pieces_created',
    product_sessions = 'product_sessions',
    voter_files_created = 'voter_files_created',
    voter_data_adoption = 'voter_data_adoption',

    // p2v details / viability
    automated_score = 'automated_score',
    p2v_status = 'p2v_status',
    totalregisteredvoters = 'totalregisteredvoters',
    votegoal = 'votegoal',
    win_number = 'win_number',
  }
}
export type MockApi = {
  getById: () => Promise<undefined>
  create: () => Promise<undefined>
  update: () => Promise<undefined>
  doSearch: () => Promise<undefined>
}
export type MockBatchApi = {
  create: () => Promise<undefined>
  update: () => Promise<undefined>
}
export type MockBaseDiscovery = {
  config: { accessToken: null }
}
type MockAutomationDiscovery = MockBaseDiscovery & {
  actions: MockBaseDiscovery
}
type MockCmsDiscovery = MockBaseDiscovery & {
  auditLogs: MockBaseDiscovery
  blogs: MockBaseDiscovery
  domains: MockBaseDiscovery
  hubdb: MockBaseDiscovery
  pages: MockBaseDiscovery
  performance: MockBaseDiscovery
  siteSearch: MockBaseDiscovery
  sourceCode: MockBaseDiscovery
  urlRedirects: MockBaseDiscovery
}
type MockCommunicationPreferencesDiscovery = MockBaseDiscovery
type MockConversationsDiscovery = MockBaseDiscovery
type MockEventsDiscovery = MockBaseDiscovery
type MockFilesDiscovery = MockBaseDiscovery
type MockMarketingDiscovery = MockBaseDiscovery
type MockOauthDiscovery = MockBaseDiscovery
type MockSettingsDiscovery = MockBaseDiscovery
type MockWebhooksDiscovery = MockBaseDiscovery
export type MockHubspotClient = {
  config: { accessToken: null }
  crm: {
    companies: {
      basicApi: MockApi
      batchApi: MockBatchApi
    }
    contacts: {
      basicApi: MockApi
      searchApi: MockApi
    }
    owners: {
      ownersApi: MockApi
    }
    associations: {
      v4: {
        batchApi: MockBatchApi
      }
    }
  }
  automation: MockAutomationDiscovery
  cms: MockCmsDiscovery
  communicationPreferences: MockCommunicationPreferencesDiscovery
  conversations: MockConversationsDiscovery
  events: MockEventsDiscovery
  files: MockFilesDiscovery
  marketing: MockMarketingDiscovery
  oauth: MockOauthDiscovery
  settings: MockSettingsDiscovery
  webhooks: MockWebhooksDiscovery
  init: () => void
  setAccessToken: (token: string) => void
  setApiKey: (apiKey: string) => void
  setDeveloperApiKey: (developerApiKey: string) => void
  apiRequest: (opts?: Record<string, unknown>) => Promise<Response>
}
