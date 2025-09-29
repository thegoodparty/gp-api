export interface PersonInput {
  id?: string
  FirstName?: string | null
  LastName?: string | null
  Gender?: string | null
  Age?: string | null
  Age_Int?: number | null
  Parties_Description?: string | null
  Registered_Voter?: boolean | null
  Voter_Status?: string | null
  Residence_Addresses_AddressLine?: string | null
  Residence_Addresses_City?: string | null
  Residence_Addresses_State?: string | null
  Residence_Addresses_Zip?: string | null
  Residence_Addresses_ZipPlus4?: string | null
  VoterTelephones_CellPhoneFormatted?: string | null
  VoterTelephones_LandlineFormatted?: string | null
  Marital_Status?: string | null
  Presence_Of_Children?: string | null
  Veteran_Status?: string | null
  Homeowner_Probability_Model?: string | null
  Business_Owner?: string | null
  Education_Of_Person?: string | null
  EthnicGroups_EthnicGroup1Desc?: string | null
  Language_Code?: string | null
  Estimated_Income_Amount?: string | null
  Residence_Addresses_Latitude?: string | null
  Residence_Addresses_Longitude?: string | null
}

export interface PersonOutput {
  id?: string
  firstName: string
  lastName: string
  gender: 'Male' | 'Female' | 'Unknown'
  age: number | 'Unknown'
  politicalParty: string
  registeredVoter: 'Yes' | 'No' | 'Unknown'
  activeVoter: 'Unknown'
  voterStatus: string
  address: string
  cellPhone: string
  landline: string
  maritalStatus:
    | 'Likely Married'
    | 'Likely Single'
    | 'Married'
    | 'Single'
    | 'Unknown'
  hasChildrenUnder18: 'Yes' | 'No' | 'Unknown'
  veteranStatus: 'Yes' | 'Unknown'
  homeowner: 'Yes' | 'Likely' | 'No' | 'Unknown'
  businessOwner: 'Yes' | 'Unknown'
  levelOfEducation:
    | 'None'
    | 'High School Diploma'
    | 'Technical School'
    | 'Some College'
    | 'College Degree'
    | 'Graduate Degree'
    | 'Unknown'
  ethnicityGroup:
    | 'Asian'
    | 'European'
    | 'Hispanic'
    | 'African American'
    | 'Other'
    | 'Unknown'
  language: string
  estimatedIncomeRange: string
  lat: string | null
  lng: string | null
}

export interface PersonListItem extends PersonInput {
  LALVOTERID?: string
  State?: string | null
  MiddleName?: string | null
  NameSuffix?: string | null
  Residence_Addresses_ExtraAddressLine?: string | null
  VoterTelephones_LandlineFormatted?: string | null
  County?: string | null
  City?: string | null
  Precinct?: string | null
}

export interface PeopleListResponse {
  pagination: {
    totalResults: number
    currentPage: number
    pageSize: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
  people: PersonListItem[]
}
