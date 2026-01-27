export interface PersonOutput {
  id?: string
  firstName: string
  lastName: string
  gender: 'Male' | 'Female' | 'Unknown'
  age: number | 'Unknown'
  politicalParty: 'Independent' | 'Democratic' | 'Republican' | 'Unknown'
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
  language: 'English' | 'Spanish' | 'Other'
  estimatedIncomeRange: string
  lat: string | null
  lng: string | null
}

export interface PersonListItem extends PersonOutput {
  lalVoterId?: string | null
  state?: string | null
  middleName?: string | null
  nameSuffix?: string | null
  residenceAddressesExtraAddressLine?: string | null
  voterTelephonesLandlineFormatted?: string | null
  county?: string | null
  city?: string | null
  precinct?: string | null
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
