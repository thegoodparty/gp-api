export enum PrimaryElectionResult {
  WON = 'Won Primary',
  LOST = 'Lost Primary',
  WITHDREW = 'Withdrew',
  NOT_ON_BALLOT = 'Not on Ballot',
}

export type CRMCompanyProperties = {
  name?: string
  candidate_party?: string
  candidate_office?: string
  state?: string
  candidate_state?: string
  candidate_district?: string
  logged_campaign_tracker_events?: string
  voter_files_created?: string
  sms_campaigns_requested?: string
  campaign_assistant_chats?: string
  pro_subscription_status?: string
  city?: string
  type: 'CAMPAIGN'
  last_step?: string
  last_step_date?: string | undefined
  zip?: string
  pledge_status?: 'yes' | 'no'
  is_active?: string
  live_candidate?: string
  p2v_complete_date?: string
  p2v_status?: string
  election_date?: string
  primary_date?: string
  doors_knocked?: string
  direct_mail_sent?: string
  calls_made?: string
  online_impressions?: string
  p2p_sent?: string
  event_impressions?: string
  yard_signs_impressions?: string
  my_content_pieces_created?: string
  filed_candidate?: 'yes' | 'no'
  pro_candidate?: 'Yes' | 'No'
  pro_upgrade_date?: string
  filing_start?: string
  filing_end?: string
  website?: string
  ai_office_level?: string
  office_level?: string
  running?: 'yes' | 'no'
  win_number?: string
  voter_data_adoption?: 'Unlocked' | 'Locked'
  created_by_admin?: 'yes' | 'no'
  admin_user?: string
  number_of_opponents?: string
  incumbent?: 'Yes' | 'No'
  seats_available?: string
  automated_score?: string
  partisan_np?: 'Partisan' | 'Nonpartisan'
  primary_election_result?: PrimaryElectionResult.WON
  ecanvasser_contacts_count?: string
  knocked_doors?: string
  election_results?: 'Won General'
} & FilteredCRMProperties
// & Partial<SimplePublicObjectInput>

type FilteredCRMProperties = {
  winnumber?: string
  p2vStatus?: string
  p2vstatus?: string
  p2vCompleteDate?: string
  p2vcompletedate?: string
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
