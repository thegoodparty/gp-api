export interface PersonOutput {
  id: string
  lalVoterId: string
  firstName: string | null
  middleName: string | null
  lastName: string | null
  nameSuffix: string | null
  age: number | null
  state: string
  address: {
    line1: string | null
    line2: string | null
    city: string | null
    state: string | null
    zip: string | null
    zipPlus4: string | null
    latitude: string | null
    longitude: string | null
  }
  cellPhone: string | null
  landline: string | null
  gender: 'Male' | 'Female' | null
  politicalParty: 'Independent' | 'Democratic' | 'Republican' | 'Other'
  registeredVoter: 'Yes' | 'No'
  estimatedIncomeAmount: number | null
  voterStatus:
    | 'Super'
    | 'Likely'
    | 'Unreliable'
    | 'Unlikely'
    | 'First Time'
    | null
  maritalStatus:
    | 'Likely Married'
    | 'Likely Single'
    | 'Married'
    | 'Single'
    | null
  hasChildrenUnder18: 'Yes' | 'No' | null
  veteranStatus: 'Yes' | null
  homeowner: 'Yes' | 'Likely' | 'No' | null
  businessOwner: 'Yes' | null
  levelOfEducation:
    | 'None'
    | 'High School Diploma'
    | 'Technical School'
    | 'Some College'
    | 'College Degree'
    | 'Graduate Degree'
    | null
  ethnicityGroup:
    | 'Asian'
    | 'European'
    | 'Hispanic'
    | 'African American'
    | 'Other'
    | null
  language: 'English' | 'Spanish' | 'Other'
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
  people: PersonOutput[]
}
