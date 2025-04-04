export enum VoterFileType {
  full = 'full',
  doorKnocking = 'doorKnocking',
  sms = 'sms',
  digitalAds = 'digitalAds',
  directMail = 'directMail',
  telemarketing = 'telemarketing',
  custom = 'custom',
}

// TODO: these should be cleaned up to only be what is currently used
export const CUSTOM_CHANNELS = [
  'Phone Banking',
  'Telemarketing',
  'Door Knocking',
  'Direct Mail',
  'Texting',
  'SMS Texting',
  'Facebook',
] as const

export const CHANNEL_TO_TYPE_MAP: {
  [key in CustomChannel]: VoterFileType
} = {
  'Door Knocking': VoterFileType.doorKnocking,
  'SMS Texting': VoterFileType.sms,
  Texting: VoterFileType.sms,
  'Direct Mail': VoterFileType.directMail,
  Telemarketing: VoterFileType.telemarketing,
  'Phone Banking': VoterFileType.telemarketing,
  Facebook: VoterFileType.digitalAds,
}

export const CUSTOM_FILTERS = [
  'audience_superVoters',
  'audience_likelyVoters',
  'audience_unreliableVoters',
  'audience_unlikelyVoters',
  'audience_firstTimeVoters',
  'party_independent',
  'party_democrat',
  'party_republican',
  'age_18_25',
  'age_25_35',
  'age_35_50',
  'age_50_plus',
  'gender_male',
  'gender_female',
  'gender_unknown',
  'audience_request',
] as const



export const CUSTOM_PURPOSES = ['GOTV', 'Persuasion', 'Voter ID'] as const

export type CustomChannel = (typeof CUSTOM_CHANNELS)[number]
export type CustomFilter = (typeof CUSTOM_FILTERS)[number]
type CustomPurpose = (typeof CUSTOM_PURPOSES)[number]

// TODO: store this in DB table? (currently in campaign.data)
export type CustomVoterFile = {
  name: string
  channel?: CustomChannel
  purpose?: CustomPurpose
  filters: CustomFilter[]
  createdAt: string
}
