/**
 * Shared voter-related types and enums used across multiple modules.
 *
 * This file breaks circular dependencies between voters and peerly modules
 * by providing a shared location for common voter filtering types.
 */

// Custom filter values for voter file filtering
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

// Custom channel values for voter outreach
export const CUSTOM_CHANNELS = [
  'Phone Banking',
  'Telemarketing',
  'Door Knocking',
  'Direct Mail',
  'Texting',
  'SMS Texting',
  'Facebook',
] as const

// Custom purpose values for voter outreach
export const CUSTOM_PURPOSES = ['GOTV', 'Persuasion', 'Voter ID'] as const

// Type definitions
export type CustomFilter = (typeof CUSTOM_FILTERS)[number]
export type CustomChannel = (typeof CUSTOM_CHANNELS)[number]
export type CustomPurpose = (typeof CUSTOM_PURPOSES)[number]

// Named constants for semantic access to common values
export const CHANNELS = {
  PHONE_BANKING: 'Phone Banking' as CustomChannel,
  TELEMARKETING: 'Telemarketing' as CustomChannel,
  DOOR_KNOCKING: 'Door Knocking' as CustomChannel,
  DIRECT_MAIL: 'Direct Mail' as CustomChannel,
  TEXTING: 'Texting' as CustomChannel,
  SMS_TEXTING: 'SMS Texting' as CustomChannel,
  FACEBOOK: 'Facebook' as CustomChannel,
} as const

export const PURPOSES = {
  GOTV: 'GOTV' as CustomPurpose,
  PERSUASION: 'Persuasion' as CustomPurpose,
  VOTER_ID: 'Voter ID' as CustomPurpose,
} as const
