/**
 * Shared utility for audience field mapping between request schemas and database models.
 *
 * This utility addresses the field naming inconsistency between frontend/API schemas
 * (camelCase) and the internal audience field format (snake_case).
 *
 * Related TODO: https://goodparty.atlassian.net/browse/WEB-4277
 * Frontend should be updated to use consistent field names to eliminate this mapping.
 */

import { CustomFilter } from '../../../shared/types/voter.types'

export interface AudienceFieldsInput {
  audienceSuperVoters?: boolean
  audienceLikelyVoters?: boolean
  audienceUnreliableVoters?: boolean
  audienceUnlikelyVoters?: boolean
  audienceFirstTimeVoters?: boolean
  partyIndependent?: boolean
  partyDemocrat?: boolean
  partyRepublican?: boolean
  age18_25?: boolean
  age25_35?: boolean
  age35_50?: boolean
  age50Plus?: boolean
  genderMale?: boolean
  genderFemale?: boolean
  genderUnknown?: boolean
}

export interface AudienceFieldsOutput {
  audience_superVoters?: boolean
  audience_likelyVoters?: boolean
  audience_unreliableVoters?: boolean
  audience_unlikelyVoters?: boolean
  audience_firstTimeVoters?: boolean
  party_independent?: boolean
  party_democrat?: boolean
  party_republican?: boolean
  age_18_25?: boolean
  age_25_35?: boolean
  age_35_50?: boolean
  age_50_plus?: boolean
  gender_male?: boolean
  gender_female?: boolean
  gender_unknown?: boolean
}

/**
 * Maps audience field names from input format (camelCase/mixed) to output format (snake_case).
 * Only includes fields that are explicitly set to true.
 *
 * @param input - Object with audience field properties in various naming formats
 * @returns Object with normalized snake_case field names, only including true values
 *
 * @example
 * ```typescript
 * const result = mapAudienceFields({
 *   audienceSuperVoters: true,
 *   partyIndependent: true,
 *   genderUnknown: true,
 *   age18_25: false
 * })
 * // Returns: { audience_superVoters: true, party_independent: true, gender_unknown: true }
 * ```
 */
export function mapAudienceFields(
  input: AudienceFieldsInput,
): AudienceFieldsOutput {
  return {
    ...(input.audienceSuperVoters === true
      ? { audience_superVoters: true }
      : {}),
    ...(input.audienceLikelyVoters === true
      ? { audience_likelyVoters: true }
      : {}),
    ...(input.audienceUnreliableVoters === true
      ? { audience_unreliableVoters: true }
      : {}),
    ...(input.audienceUnlikelyVoters === true
      ? { audience_unlikelyVoters: true }
      : {}),
    ...(input.audienceFirstTimeVoters === true
      ? { audience_firstTimeVoters: true }
      : {}),
    ...(input.partyIndependent === true ? { party_independent: true } : {}),
    ...(input.partyDemocrat === true ? { party_democrat: true } : {}),
    ...(input.partyRepublican === true ? { party_republican: true } : {}),
    ...(input.age18_25 === true ? { age_18_25: true } : {}),
    ...(input.age25_35 === true ? { age_25_35: true } : {}),
    ...(input.age35_50 === true ? { age_35_50: true } : {}),
    ...(input.age50Plus === true ? { age_50_plus: true } : {}),
    ...(input.genderMale === true ? { gender_male: true } : {}),
    ...(input.genderFemale === true ? { gender_female: true } : {}),
    ...(input.genderUnknown === true ? { gender_unknown: true } : {}),
  }
}

/**
 * Converts mapped audience fields to CustomFilter array format.
 * This is commonly used for voter file filtering and CSV generation.
 *
 * @param audienceFields - Mapped audience fields from mapAudienceFields()
 * @returns Array of CustomFilter keys
 *
 * @example
 * ```typescript
 * const mapped = mapAudienceFields({ audienceSuperVoters: true })
 * const filters = audienceFieldsToCustomFilters(mapped)
 * // Returns: ['audience_superVoters']
 * ```
 */
export function audienceFieldsToCustomFilters(
  audienceFields: AudienceFieldsOutput,
): CustomFilter[] {
  return Object.keys(audienceFields) as CustomFilter[]
}

/**
 * Combined utility that maps audience fields and converts to CustomFilter array in one step.
 * This is the most commonly used function for transforming request data to filter format.
 *
 * @param input - Object with audience field properties
 * @returns Array of CustomFilter keys for the true fields
 *
 * @example
 * ```typescript
 * const filters = mapAudienceFieldsToCustomFilters({
 *   audienceSuperVoters: true,
 *   partyIndependent: true,
 *   age18_25: false
 * })
 * // Returns: ['audience_superVoters', 'party_independent']
 * ```
 */
export function mapAudienceFieldsToCustomFilters(
  input: AudienceFieldsInput,
): CustomFilter[] {
  const mapped = mapAudienceFields(input)
  return audienceFieldsToCustomFilters(mapped)
}

/**
 * Actual database column names used in voter data queries.
 * These must match columns from ALLOWED_COLUMNS in the voter module.
 */
export const P2P_CSV_DB_COLUMN = {
  first_name: 'Voters_FirstName',
  last_name: 'Voters_LastName',
  phone: 'VoterTelephones_CellPhoneFormatted',
  state: 'Residence_Addresses_State',
  city: 'Residence_Addresses_City',
  zip: 'Residence_Addresses_Zip',
} as const

/**
 * CSV export column labels for P2P phone list files.
 * These are the headers that appear in exported CSV files for Peerly.
 */
export const P2P_CSV_COLUMN_LABEL = {
  first_name: 'first_name',
  last_name: 'last_name',
  lead_phone: 'lead_phone',
  state: 'state',
  city: 'city',
  zip: 'zip',
} as const

/**
 * P2P phone list column mappings for voter data CSV exports.
 * Maps actual database columns to CSV export labels for Peerly platform.
 */
export const P2P_CSV_COLUMN_MAPPINGS: { db: string; label: string }[] = [
  { db: P2P_CSV_DB_COLUMN.first_name, label: P2P_CSV_COLUMN_LABEL.first_name },
  { db: P2P_CSV_DB_COLUMN.last_name, label: P2P_CSV_COLUMN_LABEL.last_name },
  { db: P2P_CSV_DB_COLUMN.phone, label: P2P_CSV_COLUMN_LABEL.lead_phone },
  { db: P2P_CSV_DB_COLUMN.state, label: P2P_CSV_COLUMN_LABEL.state },
  { db: P2P_CSV_DB_COLUMN.city, label: P2P_CSV_COLUMN_LABEL.city },
  { db: P2P_CSV_DB_COLUMN.zip, label: P2P_CSV_COLUMN_LABEL.zip },
]
