export const CONTACTS_SEGMENT_DB_COLUMNS = {
  // Core fields
  ID: 'id',
  CREATED_AT: 'created_at',
  UPDATED_AT: 'updated_at',
  NAME: 'name',
  CAMPAIGN_ID: 'campaign_id',

  // Gender
  GENDER_MALE: 'gender_male',
  GENDER_FEMALE: 'gender_female',
  GENDER_UNKNOWN: 'gender_unknown',

  // Age groups
  AGE_18_25: 'age_18_25',
  AGE_25_35: 'age_25_35',
  AGE_35_50: 'age_35_50',
  AGE_50_PLUS: 'age_50_plus',

  // Political party
  POLITICAL_PARTY_DEMOCRAT: 'political_party_democrat',
  POLITICAL_PARTY_NON_PARTISAN: 'political_party_non_partisan',
  POLITICAL_PARTY_REPUBLICAN: 'political_party_republican',

  // Contact information
  ADDRESS: 'address',
  CELL_PHONE: 'cell_phone',
  LANDLINE: 'landline',
  EMAIL: 'email',
  EMAIL_NOT_LISTED: 'email_not_listed',

  // Contact availability
  HAS_ADDRESS: 'has_address',
  ADDRESS_NOT_LISTED: 'address_not_listed',
  HAS_CELL_PHONE: 'has_cell_phone',
  CELL_PHONE_NOT_LISTED: 'cell_phone_not_listed',
  HAS_LANDLINE: 'has_landline',
  LANDLINE_NOT_LISTED: 'landline_not_listed',
  HAS_EMAIL: 'has_email',

  // Voter registration
  REGISTERED_VOTER: 'registered_voter',
  REGISTERED_VOTER_YES: 'registered_voter_yes',
  REGISTERED_VOTER_NO: 'registered_voter_no',
  ACTIVE_VOTER_YES: 'active_voter_yes',
  ACTIVE_VOTER_NO: 'active_voter_no',

  // Voter likelihood
  VOTER_LIKELY_FIRST_TIME: 'voter_likely_first_time',
  VOTER_LIKELY_LIKELY: 'voter_likely_likely',
  VOTER_LIKELY_SUPER: 'voter_likely_super',
  VOTER_LIKELY_UNKNOWN: 'voter_likely_unknown',

  // Marital status
  MARITAL_STATUS_MARRIED: 'marital_status_married',
  MARITAL_STATUS_LIKELY_MARRIED: 'marital_status_likely_married',
  MARITAL_STATUS_SINGLE: 'marital_status_single',
  MARITAL_STATUS_LIKELY_SINGLE: 'marital_status_likely_single',
  MARITAL_STATUS_UNKNOWN: 'marital_status_unknown',

  // Children
  HAS_CHILDREN_NO: 'has_children_no',
  HAS_CHILDREN_YES: 'has_children_yes',
  HAS_CHILDREN_UNKNOWN: 'has_children_unknown',

  // Veteran status
  VETERAN_STATUS_YES: 'veteran_status_yes',
  VETERAN_STATUS_NO: 'veteran_status_no',
  VETERAN_STATUS_UNKNOWN: 'veteran_status_unknown',

  // Business owner
  BUSINESS_OWNER_YES: 'business_owner_yes',
  BUSINESS_OWNER_LIKELY: 'business_owner_likely',
  BUSINESS_OWNER_NO: 'business_owner_no',
  BUSINESS_OWNER_UNKNOWN: 'business_owner_unknown',

  // Education
  EDUCATION_HIGH_SCHOOL: 'education_high_school',
  EDUCATION_SOME_COLLEGE: 'education_some_college',
  EDUCATION_TECHNICAL_SCHOOL: 'education_technical_school',
  EDUCATION_SOME_COLLEGE_DEGREE: 'education_some_college_degree',
  EDUCATION_COLLEGE_DEGREE: 'education_college_degree',
  EDUCATION_GRADUATE_DEGREE: 'education_graduate_degree',
  EDUCATION_UNKNOWN: 'education_unknown',

  // Household income
  HOUSEHOLD_INCOME_15_25K: 'household_income_15_25k',
  HOUSEHOLD_INCOME_25_35K: 'household_income_25_35k',
  HOUSEHOLD_INCOME_35_50K: 'household_income_35_50k',
  HOUSEHOLD_INCOME_50_75K: 'household_income_50_75k',
  HOUSEHOLD_INCOME_75_100K: 'household_income_75_100k',
  HOUSEHOLD_INCOME_100_125K: 'household_income_100_125k',
  HOUSEHOLD_INCOME_125_150K: 'household_income_125_150k',
  HOUSEHOLD_INCOME_150_175K: 'household_income_150_175k',
  HOUSEHOLD_INCOME_175_200K: 'household_income_175_200k',
  HOUSEHOLD_INCOME_200_250K: 'household_income_200_250k',
  HOUSEHOLD_INCOME_250K_PLUS: 'household_income_250k_plus',
  HOUSEHOLD_INCOME_UNKNOWN: 'household_income_unknown',

  // Language
  LANGUAGE_ENGLISH: 'language_english',
  LANGUAGE_SPANISH: 'language_spanish',
  LANGUAGE_OTHER: 'language_other',

  // Ethnicity
  ETHNICITY_CAUCASIAN: 'ethnicity_caucasian',
  ETHNICITY_AFRICAN_AMERICAN: 'ethnicity_african_american',
  ETHNICITY_ASIAN: 'ethnicity_asian',
  ETHNICITY_EUROPEAN: 'ethnicity_european',
  ETHNICITY_HISPANIC: 'ethnicity_hispanic',
  ETHNICITY_UNKNOWN: 'ethnicity_unknown',
} as const

export const CONTACTS_SEGMENT_FIELD_NAMES = {
  // Core fields
  ID: 'id',
  CREATED_AT: 'createdAt',
  UPDATED_AT: 'updatedAt',
  NAME: 'name',
  CAMPAIGN_ID: 'campaignId',

  // Gender
  GENDER_MALE: 'genderMale',
  GENDER_FEMALE: 'genderFemale',
  GENDER_UNKNOWN: 'genderUnknown',

  // Age groups
  AGE_18_25: 'age18_25',
  AGE_25_35: 'age25_35',
  AGE_35_50: 'age35_50',
  AGE_50_PLUS: 'age50Plus',

  // Political party
  POLITICAL_PARTY_DEMOCRAT: 'politicalPartyDemocrat',
  POLITICAL_PARTY_NON_PARTISAN: 'politicalPartyNonPartisan',
  POLITICAL_PARTY_REPUBLICAN: 'politicalPartyRepublican',

  // Contact information
  ADDRESS: 'address',
  CELL_PHONE: 'cellPhone',
  LANDLINE: 'landline',
  EMAIL: 'email',
  EMAIL_NOT_LISTED: 'emailNotListed',

  // Contact availability
  HAS_ADDRESS: 'hasAddress',
  ADDRESS_NOT_LISTED: 'addressNotListed',
  HAS_CELL_PHONE: 'hasCellPhone',
  CELL_PHONE_NOT_LISTED: 'cellPhoneNotListed',
  HAS_LANDLINE: 'hasLandline',
  LANDLINE_NOT_LISTED: 'landlineNotListed',
  HAS_EMAIL: 'hasEmail',

  // Voter registration
  REGISTERED_VOTER: 'registeredVoter',
  REGISTERED_VOTER_YES: 'registeredVoterYes',
  REGISTERED_VOTER_NO: 'registeredVoterNo',
  ACTIVE_VOTER_YES: 'activeVoterYes',
  ACTIVE_VOTER_NO: 'activeVoterNo',

  // Voter likelihood
  VOTER_LIKELY_FIRST_TIME: 'voterLikelyFirstTime',
  VOTER_LIKELY_LIKELY: 'voterLikelyLikely',
  VOTER_LIKELY_SUPER: 'voterLikelySuper',
  VOTER_LIKELY_UNKNOWN: 'voterLikelyUnknown',

  // Marital status
  MARITAL_STATUS_MARRIED: 'maritalStatusMarried',
  MARITAL_STATUS_LIKELY_MARRIED: 'maritalStatusLikelyMarried',
  MARITAL_STATUS_SINGLE: 'maritalStatusSingle',
  MARITAL_STATUS_LIKELY_SINGLE: 'maritalStatusLikelySingle',
  MARITAL_STATUS_UNKNOWN: 'maritalStatusUnknown',

  // Children
  HAS_CHILDREN_NO: 'hasChildrenNo',
  HAS_CHILDREN_YES: 'hasChildrenYes',
  HAS_CHILDREN_UNKNOWN: 'hasChildrenUnknown',

  // Veteran status
  VETERAN_STATUS_YES: 'veteranStatusYes',
  VETERAN_STATUS_NO: 'veteranStatusNo',
  VETERAN_STATUS_UNKNOWN: 'veteranStatusUnknown',

  // Business owner
  BUSINESS_OWNER_YES: 'businessOwnerYes',
  BUSINESS_OWNER_LIKELY: 'businessOwnerLikely',
  BUSINESS_OWNER_NO: 'businessOwnerNo',
  BUSINESS_OWNER_UNKNOWN: 'businessOwnerUnknown',

  // Education
  EDUCATION_HIGH_SCHOOL: 'educationHighSchool',
  EDUCATION_SOME_COLLEGE: 'educationSomeCollege',
  EDUCATION_TECHNICAL_SCHOOL: 'educationTechnicalSchool',
  EDUCATION_SOME_COLLEGE_DEGREE: 'educationSomeCollegeDegree',
  EDUCATION_COLLEGE_DEGREE: 'educationCollegeDegree',
  EDUCATION_GRADUATE_DEGREE: 'educationGraduateDegree',
  EDUCATION_UNKNOWN: 'educationUnknown',

  // Household income
  HOUSEHOLD_INCOME_15_25K: 'householdIncome15_25k',
  HOUSEHOLD_INCOME_25_35K: 'householdIncome25_35k',
  HOUSEHOLD_INCOME_35_50K: 'householdIncome35_50k',
  HOUSEHOLD_INCOME_50_75K: 'householdIncome50_75k',
  HOUSEHOLD_INCOME_75_100K: 'householdIncome75_100k',
  HOUSEHOLD_INCOME_100_125K: 'householdIncome100_125k',
  HOUSEHOLD_INCOME_125_150K: 'householdIncome125_150k',
  HOUSEHOLD_INCOME_150_175K: 'householdIncome150_175k',
  HOUSEHOLD_INCOME_175_200K: 'householdIncome175_200k',
  HOUSEHOLD_INCOME_200_250K: 'householdIncome200_250k',
  HOUSEHOLD_INCOME_250K_PLUS: 'householdIncome250kPlus',
  HOUSEHOLD_INCOME_UNKNOWN: 'householdIncomeUnknown',

  // Language
  LANGUAGE_ENGLISH: 'languageEnglish',
  LANGUAGE_SPANISH: 'languageSpanish',
  LANGUAGE_OTHER: 'languageOther',

  // Ethnicity
  ETHNICITY_CAUCASIAN: 'ethnicityCaucasian',
  ETHNICITY_AFRICAN_AMERICAN: 'ethnicityAfricanAmerican',
  ETHNICITY_ASIAN: 'ethnicityAsian',
  ETHNICITY_EUROPEAN: 'ethnicityEuropean',
  ETHNICITY_HISPANIC: 'ethnicityHispanic',
  ETHNICITY_UNKNOWN: 'ethnicityUnknown',
} as const

export const VOTER_FILTER_KEYS = {
  // Gender filters
  VOTER_REGISTRATIONS_GENDER_MALE: 'VoterRegistrations_Gender_Male',
  VOTER_REGISTRATIONS_GENDER_FEMALE: 'VoterRegistrations_Gender_Female',
  VOTER_REGISTRATIONS_GENDER_UNKNOWN: 'VoterRegistrations_Gender_Unknown',

  // Age filters
  VOTER_REGISTRATIONS_AGE_18_25: 'VoterRegistrations_Age_18_25',
  VOTER_REGISTRATIONS_AGE_25_35: 'VoterRegistrations_Age_25_35',
  VOTER_REGISTRATIONS_AGE_35_50: 'VoterRegistrations_Age_35_50',
  VOTER_REGISTRATIONS_AGE_50_PLUS: 'VoterRegistrations_Age_50Plus',

  // Political party filters
  VOTER_REGISTRATIONS_POLITICAL_PARTY_DEMOCRAT:
    'VoterRegistrations_PoliticalParty_Democrat',
  VOTER_REGISTRATIONS_POLITICAL_PARTY_NON_PARTISAN:
    'VoterRegistrations_PoliticalParty_NonPartisan',
  VOTER_REGISTRATIONS_POLITICAL_PARTY_REPUBLICAN:
    'VoterRegistrations_PoliticalParty_Republican',

  // Contact information filters
  VOTER_TELEPHONES_CELL_PHONE_FORMATTED: 'VoterTelephones_CellPhoneFormatted',
  VOTER_TELEPHONES_LANDLINE_FORMATTED: 'VoterTelephones_LandlineFormatted',
  VOTER_EMAILS_EMAIL: 'VoterEmails_Email',
  VOTER_REGISTRATIONS_ADDRESS: 'VoterRegistrations_Address',

  // Voter registration filters
  VOTER_REGISTRATIONS_REGISTERED_VOTER_YES:
    'VoterRegistrations_RegisteredVoter_Yes',
  VOTER_REGISTRATIONS_REGISTERED_VOTER_NO:
    'VoterRegistrations_RegisteredVoter_No',

  // Active voter filters
  VOTER_REGISTRATIONS_ACTIVE_VOTER_YES: 'VoterRegistrations_ActiveVoter_Yes',
  VOTER_REGISTRATIONS_ACTIVE_VOTER_NO: 'VoterRegistrations_ActiveVoter_No',

  // Voter likelihood filters
  VOTER_REGISTRATIONS_VOTER_LIKELY_FIRST_TIME:
    'VoterRegistrations_VoterLikely_FirstTime',
  VOTER_REGISTRATIONS_VOTER_LIKELY_LIKELY:
    'VoterRegistrations_VoterLikely_Likely',
  VOTER_REGISTRATIONS_VOTER_LIKELY_SUPER:
    'VoterRegistrations_VoterLikely_Super',
  VOTER_REGISTRATIONS_VOTER_LIKELY_UNKNOWN:
    'VoterRegistrations_VoterLikely_Unknown',
} as const
