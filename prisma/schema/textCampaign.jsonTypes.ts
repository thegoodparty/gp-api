export {}

declare global {
  export namespace PrismaJson {
    export type TextCampaignAudience = {
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
      'age_50+'?: boolean
      gender_male?: boolean
      gender_female?: boolean
      gender_unknown?: boolean
      audience_request?: string
    }
  }
}
