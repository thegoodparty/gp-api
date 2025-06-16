import {
  GraphQLResolveInfo,
  GraphQLScalarType,
  GraphQLScalarTypeConfig,
} from 'graphql'
export type Maybe<T> = T | null
export type InputMaybe<T> = T | null
export type Exact<T extends { [key: string]: unknown }> = {
  [K in keyof T]: T[K]
}
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]?: Maybe<T[SubKey]>
}
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & {
  [SubKey in K]: Maybe<T[SubKey]>
}
export type MakeEmpty<
  T extends { [key: string]: unknown },
  K extends keyof T,
> = { [_ in K]?: never }
export type Incremental<T> =
  | T
  | {
      [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never
    }
export type RequireFields<T, K extends keyof T> = Omit<T, K> & {
  [P in K]-?: NonNullable<T[P]>
}
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string }
  String: { input: string; output: string }
  Boolean: { input: boolean; output: boolean }
  Int: { input: number; output: number }
  Float: { input: number; output: number }
  ISO8601Date: { input: any; output: any }
  ISO8601DateTime: { input: any; output: any }
  JSON: { input: any; output: any }
}

/**
 * BallotReady Actions Beta
 *
 */
export type Action = DatabaseIdentifiable &
  Node &
  Slug &
  Timestamps & {
    __typename?: 'Action'
    body?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /**
     * For `CLICK` actions only. URL where click should lead.
     *
     */
    destinationUrl?: Maybe<Scalars['String']['output']>
    heroImageUrl?: Maybe<Scalars['String']['output']>
    id: Scalars['ID']['output']
    inputFields: Scalars['JSON']['output']
    organization: Organization
    /** Unique string used to reference object in URLs */
    slug: Scalars['String']['output']
    title: Scalars['String']['output']
    type: ActionType
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

/** The connection type for Action. */
export type ActionConnection = {
  __typename?: 'ActionConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<ActionEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<Action>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** An edge in a connection. */
export type ActionEdge = {
  __typename?: 'ActionEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<Action>
}

export enum ActionType {
  CLICK = 'CLICK',
  OPT_IN = 'OPT_IN',
}

export type Address = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'Address'
    addressLine1?: Maybe<Scalars['String']['output']>
    addressLine2?: Maybe<Scalars['String']['output']>
    city?: Maybe<Scalars['String']['output']>
    country?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    id: Scalars['ID']['output']
    state?: Maybe<Scalars['String']['output']>
    type?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
    zip?: Maybe<Scalars['String']['output']>
  }

/** Filtering options for addresses. */
export type AddressFilter = {
  type?: InputMaybe<Array<Scalars['String']['input']>>
}

export type AddressInput = {
  addressLine1?: InputMaybe<Scalars['String']['input']>
  addressLine2?: InputMaybe<Scalars['String']['input']>
  addressee?: InputMaybe<Scalars['String']['input']>
  city?: InputMaybe<Scalars['String']['input']>
  state?: InputMaybe<Scalars['String']['input']>
  streetName?: InputMaybe<Scalars['String']['input']>
  streetNumber?: InputMaybe<Scalars['String']['input']>
  zip?: InputMaybe<Scalars['String']['input']>
}

/** Ballot measure arguments */
export type Argument = DatabaseIdentifiable &
  Node & {
    __typename?: 'Argument'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    id: Scalars['ID']['output']
    measure: Measure
    proCon?: Maybe<Sentiment>
    sourceUrl?: Maybe<Scalars['String']['output']>
    text?: Maybe<Scalars['String']['output']>
  }

export type Ballot = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'Ballot'
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    id: Scalars['ID']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
    uuid: Scalars['String']['output']
  }

export type BallotEvent = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'BallotEvent'
    ballot: Ballot
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    details: Scalars['JSON']['output']
    id: Scalars['ID']['output']
    type: Scalars['String']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

export type Body = DatabaseIdentifiable &
  GeographicalIdentifiers &
  Node &
  Timestamps & {
    __typename?: 'Body'
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /**
     * GEOIDs are numeric codes that uniquely identify all administrative/legal and statistical geographic areas for which the Census Bureau tabulates data.
     *
     * More information: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
     *
     */
    geoId?: Maybe<Scalars['String']['output']>
    id: Scalars['ID']['output']
    /**
     * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
     *
     * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
     *
     * List of commonly used MTFCC:
     *
     * * State: `G4000`
     * * County: `G4020`
     * * City: `G4110`
     *
     * Any MTFCC starting with `X` is a BallotReady defined custom code.
     *
     */
    mtfcc?: Maybe<Scalars['String']['output']>
    name: Scalars['String']['output']
    shortName: Scalars['String']['output']
    state: Scalars['String']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

export type BodyMember = DatabaseIdentifiable &
  Node & {
    __typename?: 'BodyMember'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    id: Scalars['ID']['output']
    type?: Maybe<Member>
  }

/**
 * A candidacy is an instance of a person (candidate) running for a position in a specific election (race).
 * This will have race-specific information about a person like their endorsements when running for their position, issue stances, and other information about their candidacy.
 *
 */
export type Candidacy = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'Candidacy'
    candidate: Person
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    election: Election
    endorsements: Array<Endorsement>
    id: Scalars['ID']['output']
    /** Returns true when a candidacy is included on a certified candidate list by their local election authority. We might record a candidacy before this threshold (i.e., a primary winner) but list them as uncertified (isCertified: false). */
    isCertified: Scalars['Boolean']['output']
    isHidden: Scalars['Boolean']['output']
    parties: Array<Party>
    position: Position
    race: Race
    /** The result of the election for this candidacy, if available. Will be null if the election has not yet been held. */
    result?: Maybe<ElectionResult>
    stances: Array<Stance>
    /** @deprecated Use `Candidacy.isCertified` instead. */
    uncertified: Scalars['Boolean']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
    withdrawn: Scalars['Boolean']['output']
  }

export type CandidateUrl = DatabaseIdentifiable &
  Node & {
    __typename?: 'CandidateUrl'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    entryType: Scalars['String']['output']
    id: Scalars['ID']['output']
    url: Scalars['String']['output']
  }

export type ConstituentContact = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'ConstituentContact'
    address?: Maybe<Address>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    id: Scalars['ID']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

export type Contact = {
  __typename?: 'Contact'
  email?: Maybe<Scalars['String']['output']>
  fax?: Maybe<Scalars['String']['output']>
  phone?: Maybe<Scalars['String']['output']>
  type?: Maybe<Scalars['String']['output']>
}

/** Autogenerated input type of CreateBallotEvent */
export type CreateBallotEventInput = {
  ballotId: Scalars['ID']['input']
  /** A unique identifier for the client performing the mutation. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>
  details?: InputMaybe<Scalars['JSON']['input']>
  type: Scalars['String']['input']
}

/** Autogenerated return type of CreateBallotEvent. */
export type CreateBallotEventPayload = {
  __typename?: 'CreateBallotEventPayload'
  ballotEvent?: Maybe<BallotEvent>
  /** A unique identifier for the client performing the mutation. */
  clientMutationId?: Maybe<Scalars['String']['output']>
  errors: Array<Scalars['String']['output']>
}

/** Autogenerated input type of CreateBallot */
export type CreateBallotInput = {
  address: Scalars['String']['input']
  /** A unique identifier for the client performing the mutation. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>
  email?: InputMaybe<Scalars['String']['input']>
  firstName?: InputMaybe<Scalars['String']['input']>
  lastName?: InputMaybe<Scalars['String']['input']>
  phone?: InputMaybe<Scalars['String']['input']>
}

/** Autogenerated return type of CreateBallot. */
export type CreateBallotPayload = {
  __typename?: 'CreateBallotPayload'
  ballot?: Maybe<Ballot>
  /** A unique identifier for the client performing the mutation. */
  clientMutationId?: Maybe<Scalars['String']['output']>
  engineToken?: Maybe<Scalars['String']['output']>
  errors: Array<Scalars['String']['output']>
}

/** Autogenerated input type of CreateConstituentContact */
export type CreateConstituentContactInput = {
  /** A unique identifier for the client performing the mutation. */
  clientMutationId?: InputMaybe<Scalars['String']['input']>
  dateOfBirth?: InputMaybe<Scalars['ISO8601Date']['input']>
  email?: InputMaybe<Scalars['String']['input']>
  firstName?: InputMaybe<Scalars['String']['input']>
  lastName?: InputMaybe<Scalars['String']['input']>
  location: LocationWithAddressInput
  phone?: InputMaybe<Scalars['String']['input']>
  tags?: InputMaybe<Array<Scalars['String']['input']>>
  timezone?: InputMaybe<Scalars['String']['input']>
  utm?: InputMaybe<UtmInput>
}

/** Autogenerated return type of CreateConstituentContact. */
export type CreateConstituentContactPayload = {
  __typename?: 'CreateConstituentContactPayload'
  /** A unique identifier for the client performing the mutation. */
  clientMutationId?: Maybe<Scalars['String']['output']>
  contact?: Maybe<ConstituentContact>
  errors: Array<Scalars['String']['output']>
}

export type DatabaseIdentifiable = {
  /** Identifies the primary key from the database. */
  databaseId: Scalars['Int']['output']
}

export enum DateSpecificity {
  DAY = 'DAY',
  MONTH = 'MONTH',
  YEAR = 'YEAR',
}

export type Degree = DatabaseIdentifiable &
  Node & {
    __typename?: 'Degree'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /** Type of degree received (e.g., Bachelor's, Masters') */
    degree?: Maybe<Scalars['String']['output']>
    /** Year graduated */
    gradYear?: Maybe<Scalars['Int']['output']>
    id: Scalars['ID']['output']
    /** Major studied (if listed or applicable) */
    major?: Maybe<Scalars['String']['output']>
    /** School that the person received the degree from. If they went to a specialized school within a university, only the university name will be listed. */
    school?: Maybe<Scalars['String']['output']>
  }

export type Election = DatabaseIdentifiable &
  HasRaces &
  Node &
  Slug &
  Timestamps & {
    __typename?: 'Election'
    /** Deadline for election authorities to send out mail ballots by.  The actual date may be earlier. */
    ballotsSentOutBy?: Maybe<Scalars['ISO8601Date']['output']>
    /** Date on which candidate information is made available. This date determines when the Ballot Engine becomes active. */
    candidateInformationPublishedAt?: Maybe<
      Scalars['ISO8601DateTime']['output']
    >
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /** Default time zone. For elections spanning multiple time zones this returns the most common time zone. */
    defaultTimeZone: Scalars['String']['output']
    /** The date of the election. */
    electionDay: Scalars['ISO8601Date']['output']
    id: Scalars['ID']['output']
    measures: MeasureConnection
    milestones: Array<Milestone>
    /** A descriptive name for the election according to BallotReady's naming conventions (e.g. California Consolidated Municipal Election, Tuscaloosa Municipal General Election). */
    name: Scalars['String']['output']
    originalElectionDate: Scalars['ISO8601Date']['output']
    /** Total number of races connected to this object */
    raceCount: Scalars['Int']['output']
    races: RaceConnection
    /** Unique string used to reference object in URLs */
    slug: Scalars['String']['output']
    state?: Maybe<Scalars['String']['output']>
    /** Default time zone. For elections spanning multiple time zones this returns the most common time zone. */
    timezone: Scalars['String']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
    vipElections: Array<VipElection>
    /**
     * Collection of dates and times when polling places are open
     *
     * A single date might have multiple entries. This could be because there are different times
     * for in person voting and dropping off your ballot. It could also be that a polling place is
     * closed part of the day (e.g. because of a lunch break).
     *
     */
    votingDays: VotingDayConnection
    /** Date on which voting information is made available. This date determines when the Turnout Engine becomes active. */
    votingInformationPublishedAt?: Maybe<Scalars['ISO8601DateTime']['output']>
    /** Collection of voting locations */
    votingLocations: VotingLocationConnection
  }

export type ElectionmeasuresArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
}

export type ElectionmilestonesArgs = {
  filterBy?: InputMaybe<MilestoneFilter>
}

export type ElectionracesArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<RaceFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<RaceOrder>
}

export type ElectionvotingDaysArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
}

export type ElectionvotingLocationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
}

/** The connection type for Election. */
export type ElectionConnection = {
  __typename?: 'ElectionConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<ElectionEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<Election>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** Options to filter nodes by timestamp (UTC). Combine arguments to search between timestamps. */
export type ElectionCreatedAtFilter = {
  /** Exact date. */
  eq?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than date. */
  gt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than or equal to date. */
  gte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than date. */
  lt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than or equal to date. */
  lte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
}

/** Options to filter nodes by date. Combine arguments to search between dates. */
export type ElectionDayFilter = {
  /** Exact date. */
  eq?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Greater than date. */
  gt?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Greater than or equal to date. */
  gte?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Less than date. */
  lt?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Less than or equal to date. */
  lte?: InputMaybe<Scalars['ISO8601Date']['input']>
}

/** An edge in a connection. */
export type ElectionEdge = {
  __typename?: 'ElectionEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<Election>
}

/** Filtering options for elections. */
export type ElectionFilter = {
  createdAt?: InputMaybe<ElectionCreatedAtFilter>
  electionDay?: InputMaybe<ElectionDayFilter>
  isRegular?: InputMaybe<Scalars['Boolean']['input']>
  level?: InputMaybe<ElectionLevelFilter>
  slug?: InputMaybe<Scalars['String']['input']>
  /** 2 character state code (e.g. `IL` for Illinois). */
  state?: InputMaybe<Scalars['String']['input']>
  updatedAt?: InputMaybe<ElectionUpdatedAtFilter>
}

/** Options to filter election type. */
export type ElectionLevelFilter = {
  minimum: PositionLevel
}

/** Ordering options for elections. */
export type ElectionOrder = {
  /** Possible directions in which to order a list of items when provided an `orderBy` argument. */
  direction: OrderDirection
  /** Properties by which elections can be ordered. */
  field: ElectionOrderField
}

export enum ElectionOrderField {
  /** Order elections by election day */
  ELECTION_DAY = 'ELECTION_DAY',
}

export enum ElectionResult {
  LOST = 'LOST',
  RUNOFF = 'RUNOFF',
  WON = 'WON',
}

/** Options to filter nodes by timestamp (UTC). Combine arguments to search between timestamps. */
export type ElectionUpdatedAtFilter = {
  /** Exact date. */
  eq?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than date. */
  gt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than or equal to date. */
  gte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than date. */
  lt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than or equal to date. */
  lte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
}

export type Endorsement = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'Endorsement'
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    endorser?: Maybe<Scalars['String']['output']>
    id: Scalars['ID']['output']
    organization?: Maybe<Organization>
    recommendation?: Maybe<Sentiment>
    status: EndorsementStatusTypeField
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

export enum EndorsementStatusTypeField {
  /** The candidacy has been confirmed by research */
  ACTIVE = 'ACTIVE',
  /** The candidate was not found to be running in this race by our researchers */
  NOT_FOUND = 'NOT_FOUND',
  /** The related position has not been researched yet */
  PENDING = 'PENDING',
}

export type Experience = DatabaseIdentifiable &
  Node & {
    __typename?: 'Experience'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    end?: Maybe<Scalars['String']['output']>
    id: Scalars['ID']['output']
    organization?: Maybe<Scalars['String']['output']>
    start?: Maybe<Scalars['String']['output']>
    title?: Maybe<Scalars['String']['output']>
    type?: Maybe<Scalars['String']['output']>
  }

export type FilingPeriod = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'FilingPeriod'
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /** Filing deadline. */
    endOn?: Maybe<Scalars['ISO8601Date']['output']>
    id: Scalars['ID']['output']
    /** Additional details about a filing period. For example: 'day after primary runoff'(different dates depending on election), 'set by the political party' (exact dates unknown), 'Cape Elizabeth' (regional differences). */
    notes?: Maybe<Scalars['String']['output']>
    /** Earliest filing date. Could be blank when there is no official start date. */
    startOn?: Maybe<Scalars['ISO8601Date']['output']>
    /** Different types of filing periods exist for some positions. The most common examples are when there are different periods for candidacy declaration and nominating papers. */
    type?: Maybe<FilingPeriodType>
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

/** FilingPeriod types */
export enum FilingPeriodType {
  DECLARATION = 'DECLARATION',
  NOMINATION = 'NOMINATION',
}

export type Form = DatabaseIdentifiable &
  Node & {
    __typename?: 'Form'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    fields: Array<FormField>
    id: Scalars['ID']['output']
    locale: Scalars['String']['output']
    type: FormType
    url: Scalars['String']['output']
  }

export type FormField = {
  __typename?: 'FormField'
  /**
   * Whether the underlying form marks this field as required.
   *
   * Note that it is NOT required to pass a value, regardless of the value of this field. Not
   * passing a value will simply result in it being blank on the form.'
   *
   */
  isRequired: Scalars['Boolean']['output']
  /** Textual description of field. Could be used as form label. */
  label?: Maybe<Scalars['String']['output']>
  /** Field name. Use this when passing values to the `sendForm` mutation. */
  name: Scalars['String']['output']
  /** List of possible values (e.g. party names for a `PARTY` field) */
  options?: Maybe<Array<Scalars['String']['output']>>
  /** Data type of this field. */
  type: Scalars['String']['output']
}

/** Filtering options for forms. */
export type FormFilter = {
  locale?: InputMaybe<Array<Scalars['String']['input']>>
  type?: InputMaybe<Array<FormType>>
}

export enum FormType {
  REGISTRATION = 'REGISTRATION',
  REQUEST_BALLOT = 'REQUEST_BALLOT',
}

export type Geofence = DatabaseIdentifiable &
  GeographicalIdentifiers &
  Node &
  Timestamps & {
    __typename?: 'Geofence'
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /**
     * GEOIDs are numeric codes that uniquely identify all administrative/legal and statistical geographic areas for which the Census Bureau tabulates data.
     *
     * More information: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
     *
     */
    geoId?: Maybe<Scalars['String']['output']>
    id: Scalars['ID']['output']
    /**
     * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
     *
     * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
     *
     * List of commonly used MTFCC:
     *
     * * State: `G4000`
     * * County: `G4020`
     * * City: `G4110`
     *
     * Any MTFCC starting with `X` is a BallotReady defined custom code.
     *
     */
    mtfcc?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
    validFrom?: Maybe<Scalars['ISO8601Date']['output']>
    validTo?: Maybe<Scalars['ISO8601Date']['output']>
  }

/** Objects with geographocal identifiers. */
export type GeographicalIdentifiers = {
  /**
   * GEOIDs are numeric codes that uniquely identify all administrative/legal and statistical geographic areas for which the Census Bureau tabulates data.
   *
   * More information: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
   *
   */
  geoId?: Maybe<Scalars['String']['output']>
  /**
   * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
   *
   * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
   *
   * List of commonly used MTFCC:
   *
   * * State: `G4000`
   * * County: `G4020`
   * * City: `G4110`
   *
   * Any MTFCC starting with `X` is a BallotReady defined custom code.
   *
   */
  mtfcc?: Maybe<Scalars['String']['output']>
}

export type HasCandidacies = {
  candidacies: Array<Candidacy>
}

export type HasCandidaciescandidaciesArgs = {
  includeUncertified?: InputMaybe<Scalars['Boolean']['input']>
}

export type HasOfficeHolders = {
  officeHolders: OfficeHolderConnection
}

export type HasOfficeHoldersofficeHoldersArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<OfficeHolderFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<OfficeHolderOrder>
}

export type HasRaces = {
  /** Total number of races connected to this object */
  raceCount: Scalars['Int']['output']
  races: RaceConnection
}

export type HasRacesracesArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<RaceFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<RaceOrder>
}

export type Headshot = {
  __typename?: 'Headshot'
  defaultUrl?: Maybe<Scalars['String']['output']>
  thumbnailUrl?: Maybe<Scalars['String']['output']>
}

export enum IdFilterOperator {
  /** Filtering with operator ALL should include only objects that match all provided ids */
  ALL = 'ALL',
  /** Filtering with operator ANY should include objects that match any of the provided ids */
  ANY = 'ANY',
}

/** Object linking to a person's images (headshot) */
export type ImageUrl = {
  __typename?: 'ImageUrl'
  /** Currently supported types are `default` and `thumb`. */
  type: Scalars['String']['output']
  url: Scalars['String']['output']
}

/**
 * An issue can be something like "Economy" or "Environment" that a candidate issue statement might be in regards to,
 * or something that a position can be related to (i.e. a city council position might have the issues "Taxes/Budget" and "Infrastructure/Transportation").
 *
 */
export type Issue = DatabaseIdentifiable &
  Node & {
    __typename?: 'Issue'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    expandedText: Scalars['String']['output']
    id: Scalars['ID']['output']
    key?: Maybe<Scalars['String']['output']>
    name: Scalars['String']['output']
    parentIssue?: Maybe<Issue>
    pluginEnabled?: Maybe<Scalars['Boolean']['output']>
    responseType?: Maybe<Scalars['String']['output']>
    rowOrder?: Maybe<Scalars['Int']['output']>
  }

/** The connection type for Issue. */
export type IssueConnection = {
  __typename?: 'IssueConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<IssueEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<Issue>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** An edge in a connection. */
export type IssueEdge = {
  __typename?: 'IssueEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<Issue>
}

/** Options for ID based filtering. */
export type IssueIdFilter = {
  id: Array<Scalars['ID']['input']>
  operator: IdFilterOperator
}

/** Options for location based filtering. */
export type LocationFilter = {
  point?: InputMaybe<Point>
  /** 5 digit ZCTA code. ZIP Code Tabulation Areas (ZCTAs) are generalized areal representations of United States Postal Service (USPS) ZIP Code service areas. */
  zip?: InputMaybe<Scalars['String']['input']>
}

export type LocationWithAddressInput = {
  address?: InputMaybe<AddressInput>
  point?: InputMaybe<Point>
  state: Scalars['String']['input']
}

/** Ballot measures */
export type Measure = DatabaseIdentifiable &
  GeographicalIdentifiers &
  Node &
  Slug &
  Timestamps & {
    __typename?: 'Measure'
    arguments?: Maybe<Array<Argument>>
    /** What does a 'no' vote mean? */
    conSnippet?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    election: Election
    endorsements: Array<Endorsement>
    /**
     * GEOIDs are numeric codes that uniquely identify all administrative/legal and statistical geographic areas for which the Census Bureau tabulates data.
     *
     * More information: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
     *
     */
    geoId?: Maybe<Scalars['String']['output']>
    /** True if we do not have the exact geospatial data for this measure, and instead we are using a higher level geographical unit so as to be inclusive (e.g. using the boundaries for an entire city if we do not have data for the individual city council districts). */
    hasUnknownBoundaries: Scalars['Boolean']['output']
    id: Scalars['ID']['output']
    issue?: Maybe<Issue>
    /**
     * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
     *
     * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
     *
     * List of commonly used MTFCC:
     *
     * * State: `G4000`
     * * County: `G4020`
     * * City: `G4110`
     *
     * Any MTFCC starting with `X` is a BallotReady defined custom code.
     *
     */
    mtfcc?: Maybe<Scalars['String']['output']>
    /** Name as it appears on the ballot */
    name?: Maybe<Scalars['String']['output']>
    party: Party
    /** What does a 'yes' vote mean? */
    proSnippet?: Maybe<Scalars['String']['output']>
    /** Unique string used to reference object in URLs */
    slug: Scalars['String']['output']
    state: Scalars['String']['output']
    summary?: Maybe<Scalars['String']['output']>
    text?: Maybe<Scalars['String']['output']>
    /** Descriptive title */
    title?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

/** The connection type for Measure. */
export type MeasureConnection = {
  __typename?: 'MeasureConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<MeasureEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<Measure>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** An edge in a connection. */
export type MeasureEdge = {
  __typename?: 'MeasureEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<Measure>
}

/** Filtering options for measures. */
export type MeasureFilter = {
  electionDay?: InputMaybe<ElectionDayFilter>
  /**
   * Filter by GEOID.
   *
   * Supports 2 options:
   *
   * 1. Filter by a single, exact GEOID (e.g. `geoId: "02"` to find all state-level objects in Alaska)
   * 2. Filter by multiple exact GEOIDs at the same time (e.g. `geoId: ["02", "17"]` to return state-level objects in both Alaska and Illinois)
   *
   * More information about GEOIDs: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
   *
   */
  geoId?: InputMaybe<Array<Scalars['String']['input']>>
  /**
   * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
   *
   * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
   *
   * List of commonly used MTFCC:
   *
   * * State: `G4000`
   * * County: `G4020`
   * * City: `G4110`
   *
   */
  mtfcc?: InputMaybe<Array<Scalars['String']['input']>>
  /** 2 character state code (e.g. `IL` for Illinois). */
  state?: InputMaybe<Scalars['String']['input']>
}

export enum Member {
  BOARD_MEMBER = 'BOARD_MEMBER',
  INSPECTOR_GENERAL = 'INSPECTOR_GENERAL',
  LEGAL = 'LEGAL',
  LOWER_REGIONAL_DIRECTOR = 'LOWER_REGIONAL_DIRECTOR',
  OTHER = 'OTHER',
  PRIMARY_DIRECTOR = 'PRIMARY_DIRECTOR',
  SECONDARY_DIRECTOR = 'SECONDARY_DIRECTOR',
}

export type Milestone = {
  __typename?: 'Milestone'
  category: MilestoneCategory
  channel: MilestoneChannel
  /**
   * Date in election default time zone (see `Election.timezone`)'
   *
   * Note that `datetime` might contain more detail (an exact time). However, some milestones
   * are only as specific as a date.
   *
   */
  date: Scalars['ISO8601Date']['output']
  /**
   * UTC timestamp of exact milestone date AND time. Might be `null` when exact time is unknown.
   *
   * Use `Election.timezone` to determine date and time in election local timezone. Some
   * elections span multiple timezones so we recommend displaying the timezone abbreviation to
   * user when using these milestones for display purposes. If known, the user's local timezone
   * can be used to calculate exact date/time for user.
   *
   */
  datetime?: Maybe<Scalars['ISO8601DateTime']['output']>
  /**
   * Additional qualifiers that determine the type of milestone.
   *
   * For exmaple, a deadline milestone to  mail in a ballot might either be a 'received by' or a
   * 'postmarked' deadline.
   *
   */
  features: Array<MilestoneFeature>
  /**
   * Whether this is a deadline (`CLOSE`) or a start milestone (`OPEN`).
   *
   */
  type: MilestoneObject
}

export enum MilestoneCategory {
  EARLY_VOTING = 'EARLY_VOTING',
  REGISTRATION = 'REGISTRATION',
  REQUEST_BALLOT = 'REQUEST_BALLOT',
  VOTING = 'VOTING',
}

export enum MilestoneChannel {
  BY_MAIL = 'BY_MAIL',
  DROP_OFF = 'DROP_OFF',
  IN_PERSON = 'IN_PERSON',
  ONLINE = 'ONLINE',
  SAME_DAY = 'SAME_DAY',
}

export enum MilestoneFeature {
  POSTMARKED = 'POSTMARKED',
  RECEIVED = 'RECEIVED',
}

/** Filtering options for milestones. */
export type MilestoneFilter = {
  category?: InputMaybe<Array<MilestoneCategory>>
  channel?: InputMaybe<Array<MilestoneChannel>>
  type?: InputMaybe<Array<MilestoneObject>>
}

export enum MilestoneObject {
  CLOSE = 'CLOSE',
  OPEN = 'OPEN',
}

/**
 * List of known MTFCC
 *
 * Custom, BallotReady defined MTFCC start with X
 *
 */
export type Mtfcc = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'Mtfcc'
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    id: Scalars['ID']['output']
    mtfcc: Scalars['String']['output']
    name?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

/** The connection type for Mtfcc. */
export type MtfccConnection = {
  __typename?: 'MtfccConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<MtfccEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<Mtfcc>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** An edge in a connection. */
export type MtfccEdge = {
  __typename?: 'MtfccEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<Mtfcc>
}

export type Mutation = {
  __typename?: 'Mutation'
  createBallot?: Maybe<CreateBallotPayload>
  createBallotEvent?: Maybe<CreateBallotEventPayload>
  createContact?: Maybe<CreateConstituentContactPayload>
}

export type MutationcreateBallotArgs = {
  input: CreateBallotInput
}

export type MutationcreateBallotEventArgs = {
  input: CreateBallotEventInput
}

export type MutationcreateContactArgs = {
  input: CreateConstituentContactInput
}

/** An object with an ID. */
export type Node = {
  /** ID of the object. */
  id: Scalars['ID']['output']
}

export type NormalizedPosition = DatabaseIdentifiable &
  Node & {
    __typename?: 'NormalizedPosition'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /** Generic description of this position. */
    description?: Maybe<Scalars['String']['output']>
    id: Scalars['ID']['output']
    /** Issues this type of position has been tagged with. */
    issues: Array<Issue>
    /**
     * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
     *
     * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
     *
     */
    mtfcc?: Maybe<Scalars['String']['output']>
    /** A name for the type of position. */
    name: Scalars['String']['output']
  }

/** Object types for which `globalId` lookup using `databaseId` is available. */
export enum ObjectType {
  ACTION = 'ACTION',
  ADDRESS = 'ADDRESS',
  ARGUMENT = 'ARGUMENT',
  ASSIGNMENT = 'ASSIGNMENT',
  BODY = 'BODY',
  BODY_MEMBER = 'BODY_MEMBER',
  CANDIDACY = 'CANDIDACY',
  CANDIDATE_URL = 'CANDIDATE_URL',
  CONSTITUENT_CONTACT = 'CONSTITUENT_CONTACT',
  DATASET_VERSION = 'DATASET_VERSION',
  DEGREE = 'DEGREE',
  ELECTION = 'ELECTION',
  ELECTION_TYPE = 'ELECTION_TYPE',
  ENDORSEMENT = 'ENDORSEMENT',
  EXPERIENCE = 'EXPERIENCE',
  FILING_PERIOD = 'FILING_PERIOD',
  FORM = 'FORM',
  GEOFENCE = 'GEOFENCE',
  ISSUE = 'ISSUE',
  MEASURE = 'MEASURE',
  MTFCC = 'MTFCC',
  NORMALIZED_POSITION = 'NORMALIZED_POSITION',
  OFFICE_HOLDER = 'OFFICE_HOLDER',
  OFFICE_HOLDER_URL = 'OFFICE_HOLDER_URL',
  ORGANIZATION = 'ORGANIZATION',
  PARTY = 'PARTY',
  PERSON = 'PERSON',
  PLACE = 'PLACE',
  POSITION = 'POSITION',
  POSITION_AUDIT = 'POSITION_AUDIT',
  POSITION_DATE_FORMULA = 'POSITION_DATE_FORMULA',
  POSITION_ELECTION_ASSIGNMENT = 'POSITION_ELECTION_ASSIGNMENT',
  POSITION_ELECTION_FREQUENCY = 'POSITION_ELECTION_FREQUENCY',
  RACE = 'RACE',
  STANCE = 'STANCE',
  SUBSCRIPTION = 'SUBSCRIPTION',
  TENANT = 'TENANT',
  TENANT_DATASET = 'TENANT_DATASET',
  TENANT_ELECTION = 'TENANT_ELECTION',
  TENANT_ORGANIZATION = 'TENANT_ORGANIZATION',
  VOTING_DAY = 'VOTING_DAY',
  VOTING_LOCATION = 'VOTING_LOCATION',
}

/**
 * An officeholder record is a term that a person in our database holds a position.  Each officeholder record is one term (not one unique person/position combination).
 * You can query this object for information about the term dates, office contact info, and any official websites the officeholder has.
 *
 */
export type OfficeHolder = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'OfficeHolder'
    addresses: Array<Address>
    /** @deprecated Available in `OfficeHolder.contacts` instead. */
    centralPhone?: Maybe<Scalars['String']['output']>
    contacts: Array<Contact>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /** When the officeholder term ended. While a date value, actual precision is based on `specificity.`  */
    endAt?: Maybe<Scalars['ISO8601Date']['output']>
    id: Scalars['ID']['output']
    isAppointed: Scalars['Boolean']['output']
    /** True when the office holder is currently in office, false when they previously held office */
    isCurrent: Scalars['Boolean']['output']
    /** Records if the officeholder term is out of the normal schedule for the position (i.e., filling an unexpired term or a vacancy). */
    isOffCycle: Scalars['Boolean']['output']
    isVacant: Scalars['Boolean']['output']
    /** @deprecated Available in `OfficeHolder.contacts` instead. */
    officePhone?: Maybe<Scalars['String']['output']>
    /** Records if the officeholder's title is significantly different than the position name on the ballot.  If null, the title is equalent to `Position.name`. */
    officeTitle?: Maybe<Scalars['String']['output']>
    /** @deprecated Available in `OfficeHolder.contacts` instead. */
    otherPhone?: Maybe<Scalars['String']['output']>
    parties: Array<Party>
    /**
     * The party record associated with this office holder record.
     * @deprecated OfficeHolder may have multiple parties, use `OfficeHolder.parties` instead.
     */
    party?: Maybe<Party>
    /** The person record associated with this office holder record. When no person associated this means this is a vacant position. */
    person?: Maybe<Person>
    position: Position
    /** @deprecated Available in `OfficeHolder.contacts` instead. */
    primaryEmail?: Maybe<Scalars['String']['output']>
    /** Indication of term date accuracy */
    specificity?: Maybe<DateSpecificity>
    /** When the officeholder term started. While a date value, actual precision is based on `specificity.`  */
    startAt?: Maybe<Scalars['ISO8601Date']['output']>
    /**
     * The total number of years this person has held this office.
     *
     * Terms do not have to be consecutive. This field will return the same value for this person regardless of the `OfficeHolder` entry being observed.
     *
     * Complexity: 5
     *
     */
    totalYearsInOffice: Scalars['Int']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
    /** Collection of URLs associated with this officeholder. Typically includes government website and social media accounts. */
    urls: Array<Url>
  }

/**
 * An officeholder record is a term that a person in our database holds a position.  Each officeholder record is one term (not one unique person/position combination).
 * You can query this object for information about the term dates, office contact info, and any official websites the officeholder has.
 *
 */
export type OfficeHolderurlsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>
}

/** The connection type for OfficeHolder. */
export type OfficeHolderConnection = {
  __typename?: 'OfficeHolderConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<OfficeHolderEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<OfficeHolder>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** An edge in a connection. */
export type OfficeHolderEdge = {
  __typename?: 'OfficeHolderEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<OfficeHolder>
}

/** Options to filter nodes by date. Combine arguments to search between dates. */
export type OfficeHolderEndDateFilter = {
  /** Exact date. */
  eq?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Greater than date. */
  gt?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Greater than or equal to date. */
  gte?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Less than date. */
  lt?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Less than or equal to date. */
  lte?: InputMaybe<Scalars['ISO8601Date']['input']>
}

/** Filtering options for office holders. */
export type OfficeHolderFilter = {
  endAt?: InputMaybe<OfficeHolderEndDateFilter>
  isAppointed?: InputMaybe<Scalars['Boolean']['input']>
  isCurrent?: InputMaybe<Scalars['Boolean']['input']>
  isJudicial?: InputMaybe<Scalars['Boolean']['input']>
  startAt?: InputMaybe<OfficeHolderStartDateFilter>
}

/** Ordering options for office holders. */
export type OfficeHolderOrder = {
  /** Possible directions in which to order a list of items when provided an `orderBy` argument. */
  direction: OrderDirection
  /** Properties by which office holders can be ordered. */
  field: OfficeHolderOrderField
}

export enum OfficeHolderOrderField {
  /** Order office holders by end date */
  END_AT = 'END_AT',
  /** Order office holders by start date */
  START_AT = 'START_AT',
}

/** Options to filter nodes by date. Combine arguments to search between dates. */
export type OfficeHolderStartDateFilter = {
  /** Exact date. */
  eq?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Greater than date. */
  gt?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Greater than or equal to date. */
  gte?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Less than date. */
  lt?: InputMaybe<Scalars['ISO8601Date']['input']>
  /** Less than or equal to date. */
  lte?: InputMaybe<Scalars['ISO8601Date']['input']>
}

export type OfficeHolderUrl = DatabaseIdentifiable &
  Node & {
    __typename?: 'OfficeHolderUrl'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    entryType: Scalars['String']['output']
    id: Scalars['ID']['output']
    url: Scalars['String']['output']
  }

export enum OrderDirection {
  /** Specifies an ascending order for a given `orderBy` argument. */
  ASC = 'ASC',
  /** Specifies a descending order for a given `orderBy` argument. */
  DESC = 'DESC',
}

/** List of organizations with researched endorsements */
export type Organization = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'Organization'
    /** If the organization has affiliates or chapters, they may be listed here. */
    children: Array<Organization>
    color?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    description?: Maybe<Scalars['String']['output']>
    id: Scalars['ID']['output']
    issue?: Maybe<Issue>
    logoUrl?: Maybe<Scalars['String']['output']>
    name: Scalars['String']['output']
    /** If the organization is an affiliate of a larger organization, it may have a parent organization listed here. */
    parent?: Maybe<Organization>
    retiredAt?: Maybe<Scalars['ISO8601Date']['output']>
    state?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
    /** URL with type of url for the organization (i.e., website). */
    urls: Array<Url>
  }

/** The connection type for Organization. */
export type OrganizationConnection = {
  __typename?: 'OrganizationConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<OrganizationEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<Organization>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** An edge in a connection. */
export type OrganizationEdge = {
  __typename?: 'OrganizationEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<Organization>
}

/** Filtering options for organizations. */
export type OrganizationFilter = {
  /** Parent organization ID */
  parentId?: InputMaybe<Scalars['ID']['input']>
}

/** Information about pagination in a connection. */
export type PageInfo = {
  __typename?: 'PageInfo'
  /** When paginating forwards, the cursor to continue. */
  endCursor?: Maybe<Scalars['String']['output']>
  /** When paginating forwards, are there more items? */
  hasNextPage: Scalars['Boolean']['output']
  /** When paginating backwards, are there more items? */
  hasPreviousPage: Scalars['Boolean']['output']
  /** When paginating backwards, the cursor to continue. */
  startCursor?: Maybe<Scalars['String']['output']>
}

export type Party = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'Party'
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    id: Scalars['ID']['output']
    name: Scalars['String']['output']
    /** Abbreviated name. Note that these are not unique. */
    shortName: Scalars['String']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

/**
 * Contains data about any person who appears in our database as a candidate or an officeholder (or both).
 * This is where data like education, job experience and other biographical information is stored.
 * For issue stances, endorsements, or other information about a candidate you should query the Candidacy object.
 * For term dates, office location, or other officeholder information, use the OfficeHolder object.
 *
 */
export type Person = DatabaseIdentifiable &
  HasCandidacies &
  HasOfficeHolders &
  Node &
  Slug &
  Timestamps & {
    __typename?: 'Person'
    /** Plain text bio for the person */
    bioText?: Maybe<Scalars['String']['output']>
    candidacies: Array<Candidacy>
    contacts: Array<Contact>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /** List of person's educational degrees */
    degrees: Array<Degree>
    /** @deprecated Available in Person.contacts */
    email?: Maybe<Scalars['String']['output']>
    /** List of person's professional experience. */
    experiences: Array<Experience>
    /** First name as it appears on candidate lists released by local election authorities. */
    firstName?: Maybe<Scalars['String']['output']>
    /** Formatted full name based on name components. */
    fullName: Scalars['String']['output']
    /** @deprecated Use `Person.images` instead. */
    headshot: Headshot
    id: Scalars['ID']['output']
    /** Collection of URLs for different types of candidate photos. */
    images: Array<ImageUrl>
    /** Last name as it appears on candidate lists released by local election authorities. */
    lastName?: Maybe<Scalars['String']['output']>
    /** Middle name as it appears on candidate lists released by local election authorities. */
    middleName?: Maybe<Scalars['String']['output']>
    /** Alternative name as it appears on candidate lists released by local election authorities. */
    nickname?: Maybe<Scalars['String']['output']>
    officeHolders: OfficeHolderConnection
    /** @deprecated Available in Person.contacts */
    phone?: Maybe<Scalars['String']['output']>
    /** Unique string used to reference object in URLs */
    slug: Scalars['String']['output']
    /** Suffix as it appears on candidate lists released by local election authorities. */
    suffix?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
    /** Collection of URLs associated with this person. Typically includes campaign website and social media accounts. */
    urls: Array<Url>
  }

/**
 * Contains data about any person who appears in our database as a candidate or an officeholder (or both).
 * This is where data like education, job experience and other biographical information is stored.
 * For issue stances, endorsements, or other information about a candidate you should query the Candidacy object.
 * For term dates, office location, or other officeholder information, use the OfficeHolder object.
 *
 */
export type PersoncandidaciesArgs = {
  includeUncertified?: InputMaybe<Scalars['Boolean']['input']>
}

/**
 * Contains data about any person who appears in our database as a candidate or an officeholder (or both).
 * This is where data like education, job experience and other biographical information is stored.
 * For issue stances, endorsements, or other information about a candidate you should query the Candidacy object.
 * For term dates, office location, or other officeholder information, use the OfficeHolder object.
 *
 */
export type PersonofficeHoldersArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<OfficeHolderFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<OfficeHolderOrder>
}

/**
 * Contains data about any person who appears in our database as a candidate or an officeholder (or both).
 * This is where data like education, job experience and other biographical information is stored.
 * For issue stances, endorsements, or other information about a candidate you should query the Candidacy object.
 * For term dates, office location, or other officeholder information, use the OfficeHolder object.
 *
 */
export type PersonurlsArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>
}

/** The connection type for Person. */
export type PersonConnection = {
  __typename?: 'PersonConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<PersonEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<Person>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** An edge in a connection. */
export type PersonEdge = {
  __typename?: 'PersonEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<Person>
}

/** Filtering options for people. */
export type PersonFilter = {
  slug?: InputMaybe<Scalars['String']['input']>
}

/** An area (such as state, city, or county). You can find voting and registration information associated with a place, as well as positions organized by place. */
export type Place = DatabaseIdentifiable &
  GeographicalIdentifiers &
  Node &
  Slug &
  Timestamps & {
    __typename?: 'Place'
    addresses: Array<Address>
    /**
     * Whether someone who is younger than eighteen (18) is allowed to vote in a primary election.
     *
     * Some places allow a person to register to vote before they turn eighteen, as long as they
     * turn eighteen before the General Election. In a subset of these places a voter is allowed
     * to already vote in a Primary Election even wehn they are not eighteen yet.
     *
     */
    canVoteInPrimaryWhen18ByGeneral?: Maybe<Scalars['Boolean']['output']>
    contacts: Array<Contact>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    dissolved: Scalars['Boolean']['output']
    forms: Array<Form>
    /**
     * GEOIDs are numeric codes that uniquely identify all administrative/legal and statistical geographic areas for which the Census Bureau tabulates data.
     *
     * More information: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
     *
     */
    geoId?: Maybe<Scalars['String']['output']>
    hasVoteByMail: Scalars['Boolean']['output']
    id: Scalars['ID']['output']
    isPrintingEnabled: Scalars['Boolean']['output']
    isReceiverOfVoteByMailRequests: Scalars['Boolean']['output']
    /**
     * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
     *
     * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
     *
     * List of commonly used MTFCC:
     *
     * * State: `G4000`
     * * County: `G4020`
     * * City: `G4110`
     *
     * Any MTFCC starting with `X` is a BallotReady defined custom code.
     *
     */
    mtfcc?: Maybe<Scalars['String']['output']>
    name: Scalars['String']['output']
    /**
     * Returns positions associated with this place. Defaults to positions currently associated with this place. To view historical or future position associations use the `validOn` argument. A position association could change because of redistricting for example.'
     *
     */
    positions: PositionConnection
    primaryType?: Maybe<Scalars['String']['output']>
    registrationOptions: Array<RegistrationOption>
    /** Unique string used to reference object in URLs */
    slug: Scalars['String']['output']
    state: Scalars['String']['output']
    timezone?: Maybe<Scalars['String']['output']>
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
    /** Type of url directing to the online resource for the place. Types include `absentee_excuses`, `absentee` (where to start an application to vote absentee), `id_requirements`, `board_of_elections` (local only),`state_election_authority`,`voter_information`,`voter_registration_portal`,`vote_by_mail_portal`,`voter_registration_check`,`track_ballot`, and `polling_places`. */
    urls: Array<Url>
  }

/** An area (such as state, city, or county). You can find voting and registration information associated with a place, as well as positions organized by place. */
export type PlaceaddressesArgs = {
  filterBy?: InputMaybe<AddressFilter>
}

/** An area (such as state, city, or county). You can find voting and registration information associated with a place, as well as positions organized by place. */
export type PlaceformsArgs = {
  filterBy?: InputMaybe<FormFilter>
}

/** An area (such as state, city, or county). You can find voting and registration information associated with a place, as well as positions organized by place. */
export type PlacepositionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  validOn?: InputMaybe<Scalars['ISO8601Date']['input']>
}

/** The connection type for Place. */
export type PlaceConnection = {
  __typename?: 'PlaceConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<PlaceEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<Place>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** An edge in a connection. */
export type PlaceEdge = {
  __typename?: 'PlaceEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<Place>
}

/** Filtering options for places. */
export type PlaceFilter = {
  /**
   * Filter by GEOID.
   *
   * Supports 2 options:
   *
   * 1. Filter by a single, exact GEOID (e.g. `geoId: "02"` to find all state-level objects in Alaska)
   * 2. Filter by multiple exact GEOIDs at the same time (e.g. `geoId: ["02", "17"]` to return state-level objects in both Alaska and Illinois)
   *
   * More information about GEOIDs: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
   *
   */
  geoId?: InputMaybe<Array<Scalars['String']['input']>>
  /**
   * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
   *
   * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
   *
   * List of commonly used MTFCC:
   *
   * * State: `G4000`
   * * County: `G4020`
   * * City: `G4110`
   *
   */
  mtfcc?: InputMaybe<Array<Scalars['String']['input']>>
  slug?: InputMaybe<Scalars['String']['input']>
  /** 2 character state code (e.g. `IL` for Illinois). */
  state?: InputMaybe<Scalars['String']['input']>
}

/** Ordering options for places. */
export type PlaceOrder = {
  /** Possible directions in which to order a list of items when provided an `orderBy` argument. */
  direction: OrderDirection
  /** Properties by which places can be ordered. */
  field: PlaceOrderField
}

export enum PlaceOrderField {
  /** Order places by locality. Ex: Towns/villages have high locality whereas states have low locality */
  LOCALITY = 'LOCALITY',
}

/** A geographic point on Earth's surface. */
export type Point = {
  latitude: Scalars['Float']['input']
  longitude: Scalars['Float']['input']
}

/**
 * A unique office that someone can run or hold office for.
 * A position can have multiple seats if they are elected the same way (i.e. a school board position). You can query filing requirements, election schedule, and other information about the position here.
 *
 */
export type Position = DatabaseIdentifiable &
  GeographicalIdentifiers &
  HasOfficeHolders &
  Node &
  Slug &
  Timestamps & {
    __typename?: 'Position'
    /** `true` if the position is normally appointed. */
    appointed: Scalars['Boolean']['output']
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /** Additional detail relevant to the position name, depending on how the position appears on the ballot. For example, local court judges are responsible for adjudicating cases in Civil and Criminal Courts at the trial-level in certain specific areas, such as small-claims court or drug court. */
    description?: Maybe<Scalars['String']['output']>
    electionFrequencies: Array<PositionElectionFrequency>
    eligibilityRequirements?: Maybe<Scalars['String']['output']>
    /** Position time commitment, where it is made publicly available. */
    employmentType?: Maybe<Scalars['String']['output']>
    /** Typically includes address line 1, address line 2, city, state, zip for where to submit filing paperwork. */
    filingAddress?: Maybe<Scalars['String']['output']>
    /** Phone number for the relevant local election authority. */
    filingPhone?: Maybe<Scalars['String']['output']>
    /** Associated filing fees and petition signatures required to run. */
    filingRequirements?: Maybe<Scalars['String']['output']>
    /**
     * GEOIDs are numeric codes that uniquely identify all administrative/legal and statistical geographic areas for which the Census Bureau tabulates data.
     *
     * More information: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
     *
     */
    geoId?: Maybe<Scalars['String']['output']>
    /** A boolean marked as true if a candidate can win the position outright in the primary by receiving a certain threshold of the vote percentage (e.g., 50%) */
    hasMajorityVotePrimary: Scalars['Boolean']['output']
    /** True when a primary election is usually held for this position. */
    hasPrimary?: Maybe<Scalars['Boolean']['output']>
    /** True when general election uses ranked choice voting. The maximum number of votes allowed is available in `rankedChoiceMaxVotesGeneral` */
    hasRankedChoiceGeneral: Scalars['Boolean']['output']
    /** True when general election uses ranked choice voting. The maximum number of votes allowed is available in `rankedChoiceMaxVotesPrimary` */
    hasRankedChoicePrimary: Scalars['Boolean']['output']
    /** True if we do not have the exact geospatial data for this position, and instead we are using a higher level geographical unit so as to be inclusive (e.g. using the boundaries for an entire city if we do not have data for the individual city council districts). */
    hasUnknownBoundaries: Scalars['Boolean']['output']
    id: Scalars['ID']['output']
    /** Issues this position has been tagged with. */
    issues: Array<Issue>
    /** True when this is a judicial position. */
    judicial: Scalars['Boolean']['output']
    /** The level of the position. */
    level: PositionLevel
    /** The maximum amount a potential candidate would have to pay to file to run for the position. */
    maximumFilingFee?: Maybe<Scalars['Float']['output']>
    /** The minimum age you must be to run for the position */
    minimumAge?: Maybe<Scalars['Int']['output']>
    /**
     * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
     *
     * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
     *
     * List of commonly used MTFCC:
     *
     * * State: `G4000`
     * * County: `G4020`
     * * City: `G4110`
     *
     * Any MTFCC starting with `X` is a BallotReady defined custom code.
     *
     */
    mtfcc?: Maybe<Scalars['String']['output']>
    /** If true, a potential candidate must be a registered voter in order to file to run for office. If null, the data has not been collected yet. */
    mustBeRegisteredVoter?: Maybe<Scalars['Boolean']['output']>
    /** If true, a potential candidate must be a resident of the jurisdiction area of the position in order to file to run for office. If null, the data has not been collected yet. */
    mustBeResident?: Maybe<Scalars['Boolean']['output']>
    /** If true, a potential candidate must have some sort of professional experiences in order to file to run for office. If null, the data has not been collected yet. */
    mustHaveProfessionalExperience?: Maybe<Scalars['Boolean']['output']>
    /** A name for the position. In some instances position names are referred to differently on their own websites than on the ballot. In this case, we choose a broad name that encompasses both ballot and BallotReady position naming conventions. */
    name: Scalars['String']['output']
    normalizedPosition: NormalizedPosition
    officeHolders: OfficeHolderConnection
    /** The relevant local election authority a prospective candidate would need to contact for filing procedures as it is available on the election authority's website. */
    paperworkInstructions?: Maybe<Scalars['String']['output']>
    /** The partisan nature of the position (e.g. partisan, nonpartisan). */
    partisanType?: Maybe<Scalars['String']['output']>
    /**
     * Returns places (localities like county, city, etc.) associated with this position. Defaults to places currently associated with this position. To view historical or future place associations use the `validOn` argument. A place association could change because of redistricting for example.'
     *
     */
    places: PlaceConnection
    races: RaceConnection
    /** Maximum number of votes allowed in ranked choice general election. */
    rankedChoiceMaxVotesGeneral?: Maybe<Scalars['Int']['output']>
    /** Maximum number of votes allowed in ranked choice general election. */
    rankedChoiceMaxVotesPrimary?: Maybe<Scalars['Int']['output']>
    /** True when incumbent is retained in an election. Mostly relevant for judicial positions. */
    retention: Scalars['Boolean']['output']
    /** Indicates the order in which positions will appear on a ballot. */
    rowOrder: Scalars['Int']['output']
    /** Describes whether this field is a running mate for another position and what kind of running mate this position is. If this field is null, it is not a running mate. If the field is primary, the running mate affiliation occurs in the primary and continues to the general. If the value is general, the running mate affiliation does not occur until the general. This field will appear with a set value on positions like the vice president and lieutenant governors. */
    runningMateStyle?: Maybe<RunningMate>
    /** Position salary information where it is made publicly available. */
    salary?: Maybe<Scalars['String']['output']>
    /** The maximum number of people who will be elected to that position during a given election. Also see `selectionsAllowed`. */
    seats: Scalars['Int']['output']
    /** The maximum number of candidates a voter can select on their ballot. Note that this could be different than `seats`. */
    selectionsAllowed: Scalars['Int']['output']
    /** Unique string used to reference object in URLs */
    slug: Scalars['String']['output']
    staggeredTerm: Scalars['Boolean']['output']
    state?: Maybe<Scalars['String']['output']>
    /** Area name as it appears on the ballot (e.g. 'District', 'Ward', 'Township') */
    subAreaName?: Maybe<Scalars['String']['output']>
    /** Area value as it appears on the ballot (e.g. '1A', 'G') */
    subAreaValue?: Maybe<Scalars['String']['output']>
    /** BallotReady organizes position and candidate research into five Tiers: (1) Federal, (2) State, (3) County & Municipal, (4) Small Town, Township & School Board, and (5) Special Districts and local small population positions */
    tier: Scalars['Int']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

/**
 * A unique office that someone can run or hold office for.
 * A position can have multiple seats if they are elected the same way (i.e. a school board position). You can query filing requirements, election schedule, and other information about the position here.
 *
 */
export type PositionofficeHoldersArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<OfficeHolderFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<OfficeHolderOrder>
}

/**
 * A unique office that someone can run or hold office for.
 * A position can have multiple seats if they are elected the same way (i.e. a school board position). You can query filing requirements, election schedule, and other information about the position here.
 *
 */
export type PositionplacesArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  validOn?: InputMaybe<Scalars['ISO8601Date']['input']>
}

/**
 * A unique office that someone can run or hold office for.
 * A position can have multiple seats if they are elected the same way (i.e. a school board position). You can query filing requirements, election schedule, and other information about the position here.
 *
 */
export type PositionracesArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<RaceFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  orderBy?: InputMaybe<RaceOrder>
}

/** The connection type for Position. */
export type PositionConnection = {
  __typename?: 'PositionConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<PositionEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<Position>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** Options to filter nodes by timestamp (UTC). Combine arguments to search between timestamps. */
export type PositionCreatedAtFilter = {
  /** Exact date. */
  eq?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than date. */
  gt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than or equal to date. */
  gte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than date. */
  lt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than or equal to date. */
  lte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
}

/** An edge in a connection. */
export type PositionEdge = {
  __typename?: 'PositionEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /**
   * True when position fully encompasses the geographical area searched for (e.g. ZCTA area). Only set when filtering by ZCTA (ZIP), it will return `null` in all other cases.'
   *
   * Complexity: 3
   *
   */
  isContained?: Maybe<Scalars['Boolean']['output']>
  /** The item at the end of the edge. */
  node?: Maybe<Position>
}

export type PositionElectionFrequency = DatabaseIdentifiable &
  Node & {
    __typename?: 'PositionElectionFrequency'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /** Array of integers used to calculate when next election is. Use with referenceYear (Ex. [2, 4]: An election occurs two years after referenceYear and then again, 4 years after that election */
    frequency: Array<Scalars['Int']['output']>
    id: Scalars['ID']['output']
    position: Position
    /** Year to be used as a base when caclulating future or past election years. Use with frequency */
    referenceYear: Scalars['Int']['output']
    seats?: Maybe<Array<Scalars['Int']['output']>>
    /** The date this frequency becomes valid */
    validFrom: Scalars['ISO8601Date']['output']
    /** The date on which this frequency expires */
    validTo?: Maybe<Scalars['ISO8601Date']['output']>
  }

/** Filtering options for positions. */
export type PositionFilter = {
  createdAt?: InputMaybe<PositionCreatedAtFilter>
  electionDay?: InputMaybe<ElectionDayFilter>
  /**
   * Filter by GEOID.
   *
   * Supports 2 options:
   *
   * 1. Filter by a single, exact GEOID (e.g. `geoId: "02"` to find all state-level objects in Alaska)
   * 2. Filter by multiple exact GEOIDs at the same time (e.g. `geoId: ["02", "17"]` to return state-level objects in both Alaska and Illinois)
   *
   * More information about GEOIDs: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
   *
   */
  geoId?: InputMaybe<Array<Scalars['String']['input']>>
  isAppointed?: InputMaybe<Scalars['Boolean']['input']>
  isJudicial?: InputMaybe<Scalars['Boolean']['input']>
  issue?: InputMaybe<IssueIdFilter>
  /** The level of the position: local, city, county, regional, state, federal or township */
  level?: InputMaybe<Array<PositionLevel>>
  /**
   * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
   *
   * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
   *
   * List of commonly used MTFCC:
   *
   * * State: `G4000`
   * * County: `G4020`
   * * City: `G4110`
   *
   */
  mtfcc?: InputMaybe<Array<Scalars['String']['input']>>
  slug?: InputMaybe<Scalars['String']['input']>
  /** 2 character state code (e.g. `IL` for Illinois). */
  state?: InputMaybe<Scalars['String']['input']>
  /** BallotReady tiers used to classify positions data (1-5). */
  tier?: InputMaybe<Array<Scalars['Int']['input']>>
  updatedAt?: InputMaybe<PositionUpdatedAtFilter>
}

export enum PositionLevel {
  CITY = 'CITY',
  COUNTY = 'COUNTY',
  FEDERAL = 'FEDERAL',
  LOCAL = 'LOCAL',
  REGIONAL = 'REGIONAL',
  STATE = 'STATE',
  TOWNSHIP = 'TOWNSHIP',
}

/** Options to filter nodes by timestamp (UTC). Combine arguments to search between timestamps. */
export type PositionUpdatedAtFilter = {
  /** Exact date. */
  eq?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than date. */
  gt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than or equal to date. */
  gte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than date. */
  lt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than or equal to date. */
  lte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
}

export type Query = {
  __typename?: 'Query'
  actions: ActionConnection
  /** The complexity of the current query */
  complexity: Scalars['Int']['output']
  /** Look up elections. */
  elections: ElectionConnection
  /** List of issue categories */
  issues: IssueConnection
  /** Look up ballot measures */
  measures: MeasureConnection
  /**
   * List of known MTFCC
   *
   * Custom, BallotReady defined MTFCC start with X
   *
   */
  mtfcc: MtfccConnection
  /** Fetches an object given its ID. */
  node?: Maybe<Node>
  nodeBySlug?: Maybe<Node>
  /** Fetches a list of objects given a list of IDs. */
  nodes: Array<Maybe<Node>>
  /** Look up office holders */
  officeHolders: OfficeHolderConnection
  /** List of organizations with researched endorsements */
  organizations: OrganizationConnection
  /** Look up people (candidates) */
  people: PersonConnection
  /** Look up places */
  places: PlaceConnection
  /** Look up positions */
  positions: PositionConnection
  /** Look up races */
  races: RaceConnection
  /** Look up voting locations (in person voting and ballot drop off locations.) */
  votingLocations: VotingLocationConnection
}

export type QueryactionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
}

export type QueryelectionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<ElectionFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  location?: InputMaybe<LocationFilter>
  orderBy?: InputMaybe<ElectionOrder>
}

export type QueryissuesArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
}

export type QuerymeasuresArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<MeasureFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  location?: InputMaybe<LocationFilter>
}

export type QuerymtfccArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
}

export type QuerynodeArgs = {
  id: Scalars['ID']['input']
}

export type QuerynodeBySlugArgs = {
  objectType: ObjectType
  slug: Scalars['String']['input']
}

export type QuerynodesArgs = {
  ids: Array<Scalars['ID']['input']>
}

export type QueryofficeHoldersArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<OfficeHolderFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  location?: InputMaybe<LocationFilter>
  orderBy?: InputMaybe<OfficeHolderOrder>
}

export type QueryorganizationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<OrganizationFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
}

export type QuerypeopleArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<PersonFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  search?: InputMaybe<Scalars['String']['input']>
}

export type QueryplacesArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<PlaceFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  location?: InputMaybe<LocationFilter>
  orderBy?: InputMaybe<PlaceOrder>
}

export type QuerypositionsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<PositionFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  location?: InputMaybe<LocationFilter>
}

export type QueryracesArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy?: InputMaybe<RaceFilter>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  location?: InputMaybe<LocationFilter>
  orderBy?: InputMaybe<RaceOrder>
}

export type QueryvotingLocationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  filterBy: VotingLocationFilter
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
  location?: InputMaybe<LocationFilter>
}

/**
 * A unique instance of a position and election combination in the BallotReady database.
 * You can query this object for information about the race, such as what kind of race it is (isRunoff, isRecall, isPrimary, etc.) pull in the candidacies of the people running in the race, and more.
 *
 */
export type Race = DatabaseIdentifiable &
  HasCandidacies &
  Node &
  Timestamps & {
    __typename?: 'Race'
    candidacies: Array<Candidacy>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    election: Election
    /** Dates between which a person can file paperwork to run for office and any pertinent notes. Note about data structure: We usually replace filing periods for a race rather than update them, so createdAt and updatedAt will usually be the same and createdAt does not reflect the first date we had a filingPeriod listed for race.  */
    filingPeriods: Array<FilingPeriod>
    id: Scalars['ID']['output']
    /** When true, this race was scheduled but will not appear on the ballot for some reason.For example, in some places if only one candidate files to run for a position, then the race will not appear on the ballot. */
    isDisabled?: Maybe<Scalars['Boolean']['output']>
    /** True if the race is partisan */
    isPartisan?: Maybe<Scalars['Boolean']['output']>
    /** True if the race is primary */
    isPrimary: Scalars['Boolean']['output']
    /** True if the race is a recall election */
    isRecall: Scalars['Boolean']['output']
    /** True if the race is a runoff */
    isRunoff: Scalars['Boolean']['output']
    /** True if the race is for an unexpired term (i.e. off-schedule) */
    isUnexpired: Scalars['Boolean']['output']
    position: Position
    /** The maximum number of people who will be elected to this position during a given election. */
    seats?: Maybe<Scalars['Int']['output']>
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

/**
 * A unique instance of a position and election combination in the BallotReady database.
 * You can query this object for information about the race, such as what kind of race it is (isRunoff, isRecall, isPrimary, etc.) pull in the candidacies of the people running in the race, and more.
 *
 */
export type RacecandidaciesArgs = {
  includeUncertified?: InputMaybe<Scalars['Boolean']['input']>
}

/** The connection type for Race. */
export type RaceConnection = {
  __typename?: 'RaceConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<RaceEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<Race>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** Options to filter nodes by timestamp (UTC). Combine arguments to search between timestamps. */
export type RaceCreatedAtFilter = {
  /** Exact date. */
  eq?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than date. */
  gt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than or equal to date. */
  gte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than date. */
  lt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than or equal to date. */
  lte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
}

/** An edge in a connection. */
export type RaceEdge = {
  __typename?: 'RaceEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<Race>
}

/** Filtering options for races. */
export type RaceFilter = {
  createdAt?: InputMaybe<RaceCreatedAtFilter>
  electionDay?: InputMaybe<ElectionDayFilter>
  electionId?: InputMaybe<Scalars['ID']['input']>
  isPrimary?: InputMaybe<Scalars['Boolean']['input']>
  /** The level of the position. */
  level?: InputMaybe<Array<PositionLevel>>
  /** 2 character state code (e.g. `IL` for Illinois) */
  state?: InputMaybe<Scalars['String']['input']>
  /** BallotReady tiers used to classify positions data (1-5). */
  tier?: InputMaybe<Array<Scalars['Int']['input']>>
  updatedAt?: InputMaybe<RaceUpdatedAtFilter>
}

/** Ordering options for races. */
export type RaceOrder = {
  /** Possible directions in which to order a list of items when provided an `orderBy` argument. */
  direction: OrderDirection
  /** Properties by which races can be ordered. */
  field: RaceOrderField
}

export enum RaceOrderField {
  /** Order races by election day */
  ELECTION_DAY = 'ELECTION_DAY',
  /** Order races by row order */
  ROW_ORDER = 'ROW_ORDER',
}

/** Options to filter nodes by timestamp (UTC). Combine arguments to search between timestamps. */
export type RaceUpdatedAtFilter = {
  /** Exact date. */
  eq?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than date. */
  gt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Greater than or equal to date. */
  gte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than date. */
  lt?: InputMaybe<Scalars['ISO8601DateTime']['input']>
  /** Less than or equal to date. */
  lte?: InputMaybe<Scalars['ISO8601DateTime']['input']>
}

export type RegistrationOption = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'RegistrationOption'
    /**
     * Will be `null` if no upcoming election in our database yet.
     *
     * Complexity: 5
     *
     */
    availableIfDateOfBirthBeforeOrEquals?: Maybe<
      Scalars['ISO8601Date']['output']
    >
    channel: RegistrationOptionChannel
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    /** List of documents needed to register */
    documents: Array<Scalars['String']['output']>
    /** List of eligiblity requirements */
    eligibility: Array<Scalars['String']['output']>
    /** Added context for a regisration option */
    features: Array<RegistrationOptionFeature>
    id: Scalars['ID']['output']
    /** Whether a state-issued ID is required to register to vote. */
    isIdRequired: Scalars['Boolean']['output']
    /** Whether this is a preregistration option */
    isPreregistration: Scalars['Boolean']['output']
    place: Place
    /** A safe estimate for the registration deadline in number of days before an election */
    safestRegistrationDeadlineInDays?: Maybe<Scalars['Int']['output']>
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

export enum RegistrationOptionChannel {
  API = 'API',
  BY_FORM = 'BY_FORM',
  ELECTION_OFFICE = 'ELECTION_OFFICE',
  NO_REGISTRATION = 'NO_REGISTRATION',
  ONLINE = 'ONLINE',
  SAME_DAY_EARLY = 'SAME_DAY_EARLY',
  SAME_DAY_ELECTION = 'SAME_DAY_ELECTION',
}

export enum RegistrationOptionFeature {
  POSTMARKED = 'POSTMARKED',
  RECEIVED = 'RECEIVED',
}

export enum RunningMate {
  GENERAL = 'GENERAL',
  PRIMARY = 'PRIMARY',
}

export enum Sentiment {
  CON = 'CON',
  PRO = 'PRO',
}

/** Objects with slug. */
export type Slug = {
  /** Unique string used to reference object in URLs */
  slug: Scalars['String']['output']
}

export type Stance = DatabaseIdentifiable &
  Node & {
    __typename?: 'Stance'
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    id: Scalars['ID']['output']
    /** Issue category that the candidate's statement is about (i.e. Education, Economy). For a full list of issue categories we research, query the `issues` object at the top level. */
    issue: Issue
    locale?: Maybe<Scalars['String']['output']>
    /** Source of the candidate's issue statement */
    referenceUrl?: Maybe<Scalars['String']['output']>
    /** The candidate's exact statement about an issue, usually pulled from their campaign website. */
    statement?: Maybe<Scalars['String']['output']>
  }

export type SuggestedCandidacy = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'SuggestedCandidacy'
    candidate?: Maybe<Person>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    election: Election
    id: Scalars['ID']['output']
    organization?: Maybe<Organization>
    parties: Array<Party>
    position: Position
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

/** Objects with lifecycle timestamps. */
export type Timestamps = {
  /** Identifies the date and time when the object was created. */
  createdAt: Scalars['ISO8601DateTime']['output']
  /** Identifies the date and time when the object was last updated. */
  updatedAt: Scalars['ISO8601DateTime']['output']
}

export type Url = DatabaseIdentifiable & {
  __typename?: 'Url'
  /** Identifies the primary key from the database. */
  databaseId: Scalars['Int']['output']
  id: Scalars['ID']['output']
  /** Type of url. Common types include `website`, `instagram`, and `facebook`. */
  type: Scalars['String']['output']
  url: Scalars['String']['output']
}

export type UtmInput = {
  campaign?: InputMaybe<Scalars['String']['input']>
  content?: InputMaybe<Scalars['String']['input']>
  medium?: InputMaybe<Scalars['String']['input']>
  source?: InputMaybe<Scalars['String']['input']>
  term?: InputMaybe<Scalars['String']['input']>
}

/**
 *       VIP (Voter Information Project / [Google Civic API](https://developers.google.com/civic-information)) election ID
 *
 */
export type VipElection = {
  __typename?: 'VipElection'
  /** Optional party to handle cases where VIP has multiple elections for a single election (e.g. Texas party primaries) */
  party?: Maybe<Party>
  /** VIP election ID */
  vipId: Scalars['Int']['output']
}

export type VotingDay = DatabaseIdentifiable &
  Node &
  Timestamps & {
    __typename?: 'VotingDay'
    /** UTC date and time polling place closes. Use `timezone` to convert to local date and time. */
    closeAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    id: Scalars['ID']['output']
    isDropOff: Scalars['Boolean']['output']
    isEarlyVoting: Scalars['Boolean']['output']
    isInPerson: Scalars['Boolean']['output']
    /** UTC date and time polling place opens. Use `timezone` to convert to local date and time. */
    openAt: Scalars['ISO8601DateTime']['output']
    timezone: Scalars['String']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
  }

/** The connection type for VotingDay. */
export type VotingDayConnection = {
  __typename?: 'VotingDayConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<VotingDayEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<VotingDay>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** An edge in a connection. */
export type VotingDayEdge = {
  __typename?: 'VotingDayEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<VotingDay>
}

/**
 * BallotReady collects information about ballot drop boxes and in person voting locations (both listed here).
 * Generally, this does not include precinct-based voting locations available on election day.
 * If you query by latitude/longitude, you will see the voting locations available at that location.
 * The MTFCC and geoID values attached to each voting location note which area the voting location is available to (usually county).
 *
 */
export type VotingLocation = DatabaseIdentifiable &
  GeographicalIdentifiers &
  Node &
  Timestamps & {
    __typename?: 'VotingLocation'
    address?: Maybe<Address>
    /** Identifies the date and time when the object was created. */
    createdAt: Scalars['ISO8601DateTime']['output']
    /** Identifies the primary key from the database. */
    databaseId: Scalars['Int']['output']
    election: Election
    /**
     * GEOIDs are numeric codes that uniquely identify all administrative/legal and statistical geographic areas for which the Census Bureau tabulates data.
     *
     * More information: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
     *
     */
    geoId?: Maybe<Scalars['String']['output']>
    id: Scalars['ID']['output']
    /**
     * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
     *
     * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
     *
     * List of commonly used MTFCC:
     *
     * * State: `G4000`
     * * County: `G4020`
     * * City: `G4110`
     *
     * Any MTFCC starting with `X` is a BallotReady defined custom code.
     *
     */
    mtfcc?: Maybe<Scalars['String']['output']>
    name?: Maybe<Scalars['String']['output']>
    party?: Maybe<Party>
    precinct?: Maybe<Scalars['String']['output']>
    timezone: Scalars['String']['output']
    /** Identifies the date and time when the object was last updated. */
    updatedAt: Scalars['ISO8601DateTime']['output']
    /**
     * Collection of dates and times when this voting location is open
     *
     * A single date might have multiple entries. This could be because there are different times
     * for in person voting and dropping off your ballot. It could also be that a voting location is
     * closed part of the day (e.g. because of a lunch break).
     *
     */
    votingDays: VotingDayConnection
  }

/**
 * BallotReady collects information about ballot drop boxes and in person voting locations (both listed here).
 * Generally, this does not include precinct-based voting locations available on election day.
 * If you query by latitude/longitude, you will see the voting locations available at that location.
 * The MTFCC and geoID values attached to each voting location note which area the voting location is available to (usually county).
 *
 */
export type VotingLocationvotingDaysArgs = {
  after?: InputMaybe<Scalars['String']['input']>
  before?: InputMaybe<Scalars['String']['input']>
  first?: InputMaybe<Scalars['Int']['input']>
  last?: InputMaybe<Scalars['Int']['input']>
}

/** The connection type for VotingLocation. */
export type VotingLocationConnection = {
  __typename?: 'VotingLocationConnection'
  /** A list of edges. */
  edges?: Maybe<Array<Maybe<VotingLocationEdge>>>
  /** A list of nodes. */
  nodes?: Maybe<Array<Maybe<VotingLocation>>>
  /** Information to aid in pagination. */
  pageInfo: PageInfo
}

/** An edge in a connection. */
export type VotingLocationEdge = {
  __typename?: 'VotingLocationEdge'
  /** A cursor for use in pagination. */
  cursor: Scalars['String']['output']
  /** The item at the end of the edge. */
  node?: Maybe<VotingLocation>
}

/** Filtering options for polling places. */
export type VotingLocationFilter = {
  electionId: Scalars['ID']['input']
  /**
   * Filter by GEOID.
   *
   * Supports 2 options:
   *
   * 1. Filter by a single, exact GEOID (e.g. `geoId: "02"` to find all state-level objects in Alaska)
   * 2. Filter by multiple exact GEOIDs at the same time (e.g. `geoId: ["02", "17"]` to return state-level objects in both Alaska and Illinois)
   *
   * More information about GEOIDs: https://www.census.gov/programs-surveys/geography/guidance/geo-identifiers.html
   *
   */
  geoId?: InputMaybe<Array<Scalars['String']['input']>>
  isDropOff?: InputMaybe<Scalars['Boolean']['input']>
  isEarlyVoting?: InputMaybe<Scalars['Boolean']['input']>
  isInPerson?: InputMaybe<Scalars['Boolean']['input']>
  /**
   * MAF/TIGER Feature Class Code, a census designated code of 1 letter and 4 numbers (e.g. G4000) designating what kind of geographical entity is being described (Congressional District, Incorporated Place, County or Equivalent Features, etc).
   *
   * More information: https://www.census.gov/library/reference/code-lists/mt-feature-class-codes.html
   *
   * List of commonly used MTFCC:
   *
   * * State: `G4000`
   * * County: `G4020`
   * * City: `G4110`
   *
   */
  mtfcc?: InputMaybe<Array<Scalars['String']['input']>>
  /** 2 character state code (e.g. `IL` for Illinois). */
  state?: InputMaybe<Scalars['String']['input']>
}

export type ResolverTypeWrapper<T> = Promise<T> | T

export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>
}
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => Promise<TResult> | TResult

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>

export interface SubscriptionSubscriberObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> {
  subscribe: SubscriptionSubscribeFn<
    { [key in TKey]: TResult },
    TParent,
    TContext,
    TArgs
  >
  resolve?: SubscriptionResolveFn<
    TResult,
    { [key in TKey]: TResult },
    TContext,
    TArgs
  >
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>
}

export type SubscriptionObject<
  TResult,
  TKey extends string,
  TParent,
  TContext,
  TArgs,
> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>

export type SubscriptionResolver<
  TResult,
  TKey extends string,
  TParent = {},
  TContext = {},
  TArgs = {},
> =
  | ((
      ...args: any[]
    ) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo,
) => Maybe<TTypes> | Promise<Maybe<TTypes>>

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (
  obj: T,
  context: TContext,
  info: GraphQLResolveInfo,
) => boolean | Promise<boolean>

export type NextResolverFn<T> = () => Promise<T>

export type DirectiveResolverFn<
  TResult = {},
  TParent = {},
  TContext = {},
  TArgs = {},
> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo,
) => TResult | Promise<TResult>

/** Mapping of interface types */
export type ResolversInterfaceTypes<_RefType extends Record<string, unknown>> =
  {
    DatabaseIdentifiable:
      | Action
      | Address
      | Argument
      | Ballot
      | BallotEvent
      | Body
      | BodyMember
      | Candidacy
      | CandidateUrl
      | ConstituentContact
      | Degree
      | Election
      | Endorsement
      | Experience
      | FilingPeriod
      | Form
      | Geofence
      | Issue
      | Measure
      | Mtfcc
      | NormalizedPosition
      | OfficeHolder
      | OfficeHolderUrl
      | Organization
      | Party
      | Person
      | Place
      | Position
      | PositionElectionFrequency
      | Race
      | RegistrationOption
      | Stance
      | SuggestedCandidacy
      | Url
      | VotingDay
      | VotingLocation
    GeographicalIdentifiers:
      | Body
      | Geofence
      | Measure
      | Place
      | Position
      | VotingLocation
    HasCandidacies: Person | Race
    HasOfficeHolders: Person | Position
    HasRaces: Election
    Node:
      | Action
      | Address
      | Argument
      | Ballot
      | BallotEvent
      | Body
      | BodyMember
      | Candidacy
      | CandidateUrl
      | ConstituentContact
      | Degree
      | Election
      | Endorsement
      | Experience
      | FilingPeriod
      | Form
      | Geofence
      | Issue
      | Measure
      | Mtfcc
      | NormalizedPosition
      | OfficeHolder
      | OfficeHolderUrl
      | Organization
      | Party
      | Person
      | Place
      | Position
      | PositionElectionFrequency
      | Race
      | RegistrationOption
      | Stance
      | SuggestedCandidacy
      | VotingDay
      | VotingLocation
    Slug: Action | Election | Measure | Person | Place | Position
    Timestamps:
      | Action
      | Address
      | Ballot
      | BallotEvent
      | Body
      | Candidacy
      | ConstituentContact
      | Election
      | Endorsement
      | FilingPeriod
      | Geofence
      | Measure
      | Mtfcc
      | OfficeHolder
      | Organization
      | Party
      | Person
      | Place
      | Position
      | Race
      | RegistrationOption
      | SuggestedCandidacy
      | VotingDay
      | VotingLocation
  }

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Action: ResolverTypeWrapper<Action>
  ActionConnection: ResolverTypeWrapper<ActionConnection>
  ActionEdge: ResolverTypeWrapper<ActionEdge>
  ActionType: ActionType
  Address: ResolverTypeWrapper<Address>
  AddressFilter: AddressFilter
  AddressInput: AddressInput
  Argument: ResolverTypeWrapper<Argument>
  Ballot: ResolverTypeWrapper<Ballot>
  BallotEvent: ResolverTypeWrapper<BallotEvent>
  Body: ResolverTypeWrapper<Body>
  BodyMember: ResolverTypeWrapper<BodyMember>
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>
  Candidacy: ResolverTypeWrapper<Candidacy>
  CandidateUrl: ResolverTypeWrapper<CandidateUrl>
  ConstituentContact: ResolverTypeWrapper<ConstituentContact>
  Contact: ResolverTypeWrapper<Contact>
  CreateBallotEventInput: CreateBallotEventInput
  CreateBallotEventPayload: ResolverTypeWrapper<CreateBallotEventPayload>
  CreateBallotInput: CreateBallotInput
  CreateBallotPayload: ResolverTypeWrapper<CreateBallotPayload>
  CreateConstituentContactInput: CreateConstituentContactInput
  CreateConstituentContactPayload: ResolverTypeWrapper<CreateConstituentContactPayload>
  DatabaseIdentifiable: ResolverTypeWrapper<
    ResolversInterfaceTypes<ResolversTypes>['DatabaseIdentifiable']
  >
  DateSpecificity: DateSpecificity
  Degree: ResolverTypeWrapper<Degree>
  Election: ResolverTypeWrapper<Election>
  ElectionConnection: ResolverTypeWrapper<ElectionConnection>
  ElectionCreatedAtFilter: ElectionCreatedAtFilter
  ElectionDayFilter: ElectionDayFilter
  ElectionEdge: ResolverTypeWrapper<ElectionEdge>
  ElectionFilter: ElectionFilter
  ElectionLevelFilter: ElectionLevelFilter
  ElectionOrder: ElectionOrder
  ElectionOrderField: ElectionOrderField
  ElectionResult: ElectionResult
  ElectionUpdatedAtFilter: ElectionUpdatedAtFilter
  Endorsement: ResolverTypeWrapper<Endorsement>
  EndorsementStatusTypeField: EndorsementStatusTypeField
  Experience: ResolverTypeWrapper<Experience>
  FilingPeriod: ResolverTypeWrapper<FilingPeriod>
  FilingPeriodType: FilingPeriodType
  Float: ResolverTypeWrapper<Scalars['Float']['output']>
  Form: ResolverTypeWrapper<Form>
  FormField: ResolverTypeWrapper<FormField>
  FormFilter: FormFilter
  FormType: FormType
  Geofence: ResolverTypeWrapper<Geofence>
  GeographicalIdentifiers: ResolverTypeWrapper<
    ResolversInterfaceTypes<ResolversTypes>['GeographicalIdentifiers']
  >
  HasCandidacies: ResolverTypeWrapper<
    ResolversInterfaceTypes<ResolversTypes>['HasCandidacies']
  >
  HasOfficeHolders: ResolverTypeWrapper<
    ResolversInterfaceTypes<ResolversTypes>['HasOfficeHolders']
  >
  HasRaces: ResolverTypeWrapper<
    ResolversInterfaceTypes<ResolversTypes>['HasRaces']
  >
  Headshot: ResolverTypeWrapper<Headshot>
  ID: ResolverTypeWrapper<Scalars['ID']['output']>
  ISO8601Date: ResolverTypeWrapper<Scalars['ISO8601Date']['output']>
  ISO8601DateTime: ResolverTypeWrapper<Scalars['ISO8601DateTime']['output']>
  IdFilterOperator: IdFilterOperator
  ImageUrl: ResolverTypeWrapper<ImageUrl>
  Int: ResolverTypeWrapper<Scalars['Int']['output']>
  Issue: ResolverTypeWrapper<Issue>
  IssueConnection: ResolverTypeWrapper<IssueConnection>
  IssueEdge: ResolverTypeWrapper<IssueEdge>
  IssueIdFilter: IssueIdFilter
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>
  LocationFilter: LocationFilter
  LocationWithAddressInput: LocationWithAddressInput
  Measure: ResolverTypeWrapper<Measure>
  MeasureConnection: ResolverTypeWrapper<MeasureConnection>
  MeasureEdge: ResolverTypeWrapper<MeasureEdge>
  MeasureFilter: MeasureFilter
  Member: Member
  Milestone: ResolverTypeWrapper<Milestone>
  MilestoneCategory: MilestoneCategory
  MilestoneChannel: MilestoneChannel
  MilestoneFeature: MilestoneFeature
  MilestoneFilter: MilestoneFilter
  MilestoneObject: MilestoneObject
  Mtfcc: ResolverTypeWrapper<Mtfcc>
  MtfccConnection: ResolverTypeWrapper<MtfccConnection>
  MtfccEdge: ResolverTypeWrapper<MtfccEdge>
  Mutation: ResolverTypeWrapper<{}>
  Node: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['Node']>
  NormalizedPosition: ResolverTypeWrapper<NormalizedPosition>
  ObjectType: ObjectType
  OfficeHolder: ResolverTypeWrapper<OfficeHolder>
  OfficeHolderConnection: ResolverTypeWrapper<OfficeHolderConnection>
  OfficeHolderEdge: ResolverTypeWrapper<OfficeHolderEdge>
  OfficeHolderEndDateFilter: OfficeHolderEndDateFilter
  OfficeHolderFilter: OfficeHolderFilter
  OfficeHolderOrder: OfficeHolderOrder
  OfficeHolderOrderField: OfficeHolderOrderField
  OfficeHolderStartDateFilter: OfficeHolderStartDateFilter
  OfficeHolderUrl: ResolverTypeWrapper<OfficeHolderUrl>
  OrderDirection: OrderDirection
  Organization: ResolverTypeWrapper<Organization>
  OrganizationConnection: ResolverTypeWrapper<OrganizationConnection>
  OrganizationEdge: ResolverTypeWrapper<OrganizationEdge>
  OrganizationFilter: OrganizationFilter
  PageInfo: ResolverTypeWrapper<PageInfo>
  Party: ResolverTypeWrapper<Party>
  Person: ResolverTypeWrapper<Person>
  PersonConnection: ResolverTypeWrapper<PersonConnection>
  PersonEdge: ResolverTypeWrapper<PersonEdge>
  PersonFilter: PersonFilter
  Place: ResolverTypeWrapper<Place>
  PlaceConnection: ResolverTypeWrapper<PlaceConnection>
  PlaceEdge: ResolverTypeWrapper<PlaceEdge>
  PlaceFilter: PlaceFilter
  PlaceOrder: PlaceOrder
  PlaceOrderField: PlaceOrderField
  Point: Point
  Position: ResolverTypeWrapper<Position>
  PositionConnection: ResolverTypeWrapper<PositionConnection>
  PositionCreatedAtFilter: PositionCreatedAtFilter
  PositionEdge: ResolverTypeWrapper<PositionEdge>
  PositionElectionFrequency: ResolverTypeWrapper<PositionElectionFrequency>
  PositionFilter: PositionFilter
  PositionLevel: PositionLevel
  PositionUpdatedAtFilter: PositionUpdatedAtFilter
  Query: ResolverTypeWrapper<{}>
  Race: ResolverTypeWrapper<Race>
  RaceConnection: ResolverTypeWrapper<RaceConnection>
  RaceCreatedAtFilter: RaceCreatedAtFilter
  RaceEdge: ResolverTypeWrapper<RaceEdge>
  RaceFilter: RaceFilter
  RaceOrder: RaceOrder
  RaceOrderField: RaceOrderField
  RaceUpdatedAtFilter: RaceUpdatedAtFilter
  RegistrationOption: ResolverTypeWrapper<RegistrationOption>
  RegistrationOptionChannel: RegistrationOptionChannel
  RegistrationOptionFeature: RegistrationOptionFeature
  RunningMate: RunningMate
  Sentiment: Sentiment
  Slug: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['Slug']>
  Stance: ResolverTypeWrapper<Stance>
  String: ResolverTypeWrapper<Scalars['String']['output']>
  SuggestedCandidacy: ResolverTypeWrapper<SuggestedCandidacy>
  Timestamps: ResolverTypeWrapper<
    ResolversInterfaceTypes<ResolversTypes>['Timestamps']
  >
  Url: ResolverTypeWrapper<Url>
  UtmInput: UtmInput
  VipElection: ResolverTypeWrapper<VipElection>
  VotingDay: ResolverTypeWrapper<VotingDay>
  VotingDayConnection: ResolverTypeWrapper<VotingDayConnection>
  VotingDayEdge: ResolverTypeWrapper<VotingDayEdge>
  VotingLocation: ResolverTypeWrapper<VotingLocation>
  VotingLocationConnection: ResolverTypeWrapper<VotingLocationConnection>
  VotingLocationEdge: ResolverTypeWrapper<VotingLocationEdge>
  VotingLocationFilter: VotingLocationFilter
}

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Action: Action
  ActionConnection: ActionConnection
  ActionEdge: ActionEdge
  Address: Address
  AddressFilter: AddressFilter
  AddressInput: AddressInput
  Argument: Argument
  Ballot: Ballot
  BallotEvent: BallotEvent
  Body: Body
  BodyMember: BodyMember
  Boolean: Scalars['Boolean']['output']
  Candidacy: Candidacy
  CandidateUrl: CandidateUrl
  ConstituentContact: ConstituentContact
  Contact: Contact
  CreateBallotEventInput: CreateBallotEventInput
  CreateBallotEventPayload: CreateBallotEventPayload
  CreateBallotInput: CreateBallotInput
  CreateBallotPayload: CreateBallotPayload
  CreateConstituentContactInput: CreateConstituentContactInput
  CreateConstituentContactPayload: CreateConstituentContactPayload
  DatabaseIdentifiable: ResolversInterfaceTypes<ResolversParentTypes>['DatabaseIdentifiable']
  Degree: Degree
  Election: Election
  ElectionConnection: ElectionConnection
  ElectionCreatedAtFilter: ElectionCreatedAtFilter
  ElectionDayFilter: ElectionDayFilter
  ElectionEdge: ElectionEdge
  ElectionFilter: ElectionFilter
  ElectionLevelFilter: ElectionLevelFilter
  ElectionOrder: ElectionOrder
  ElectionUpdatedAtFilter: ElectionUpdatedAtFilter
  Endorsement: Endorsement
  Experience: Experience
  FilingPeriod: FilingPeriod
  Float: Scalars['Float']['output']
  Form: Form
  FormField: FormField
  FormFilter: FormFilter
  Geofence: Geofence
  GeographicalIdentifiers: ResolversInterfaceTypes<ResolversParentTypes>['GeographicalIdentifiers']
  HasCandidacies: ResolversInterfaceTypes<ResolversParentTypes>['HasCandidacies']
  HasOfficeHolders: ResolversInterfaceTypes<ResolversParentTypes>['HasOfficeHolders']
  HasRaces: ResolversInterfaceTypes<ResolversParentTypes>['HasRaces']
  Headshot: Headshot
  ID: Scalars['ID']['output']
  ISO8601Date: Scalars['ISO8601Date']['output']
  ISO8601DateTime: Scalars['ISO8601DateTime']['output']
  ImageUrl: ImageUrl
  Int: Scalars['Int']['output']
  Issue: Issue
  IssueConnection: IssueConnection
  IssueEdge: IssueEdge
  IssueIdFilter: IssueIdFilter
  JSON: Scalars['JSON']['output']
  LocationFilter: LocationFilter
  LocationWithAddressInput: LocationWithAddressInput
  Measure: Measure
  MeasureConnection: MeasureConnection
  MeasureEdge: MeasureEdge
  MeasureFilter: MeasureFilter
  Milestone: Milestone
  MilestoneFilter: MilestoneFilter
  Mtfcc: Mtfcc
  MtfccConnection: MtfccConnection
  MtfccEdge: MtfccEdge
  Mutation: {}
  Node: ResolversInterfaceTypes<ResolversParentTypes>['Node']
  NormalizedPosition: NormalizedPosition
  OfficeHolder: OfficeHolder
  OfficeHolderConnection: OfficeHolderConnection
  OfficeHolderEdge: OfficeHolderEdge
  OfficeHolderEndDateFilter: OfficeHolderEndDateFilter
  OfficeHolderFilter: OfficeHolderFilter
  OfficeHolderOrder: OfficeHolderOrder
  OfficeHolderStartDateFilter: OfficeHolderStartDateFilter
  OfficeHolderUrl: OfficeHolderUrl
  Organization: Organization
  OrganizationConnection: OrganizationConnection
  OrganizationEdge: OrganizationEdge
  OrganizationFilter: OrganizationFilter
  PageInfo: PageInfo
  Party: Party
  Person: Person
  PersonConnection: PersonConnection
  PersonEdge: PersonEdge
  PersonFilter: PersonFilter
  Place: Place
  PlaceConnection: PlaceConnection
  PlaceEdge: PlaceEdge
  PlaceFilter: PlaceFilter
  PlaceOrder: PlaceOrder
  Point: Point
  Position: Position
  PositionConnection: PositionConnection
  PositionCreatedAtFilter: PositionCreatedAtFilter
  PositionEdge: PositionEdge
  PositionElectionFrequency: PositionElectionFrequency
  PositionFilter: PositionFilter
  PositionUpdatedAtFilter: PositionUpdatedAtFilter
  Query: {}
  Race: Race
  RaceConnection: RaceConnection
  RaceCreatedAtFilter: RaceCreatedAtFilter
  RaceEdge: RaceEdge
  RaceFilter: RaceFilter
  RaceOrder: RaceOrder
  RaceUpdatedAtFilter: RaceUpdatedAtFilter
  RegistrationOption: RegistrationOption
  Slug: ResolversInterfaceTypes<ResolversParentTypes>['Slug']
  Stance: Stance
  String: Scalars['String']['output']
  SuggestedCandidacy: SuggestedCandidacy
  Timestamps: ResolversInterfaceTypes<ResolversParentTypes>['Timestamps']
  Url: Url
  UtmInput: UtmInput
  VipElection: VipElection
  VotingDay: VotingDay
  VotingDayConnection: VotingDayConnection
  VotingDayEdge: VotingDayEdge
  VotingLocation: VotingLocation
  VotingLocationConnection: VotingLocationConnection
  VotingLocationEdge: VotingLocationEdge
  VotingLocationFilter: VotingLocationFilter
}

export type exampleDirectiveArgs = {
  value: Scalars['String']['input']
}

export type exampleDirectiveResolver<
  Result,
  Parent,
  ContextType = any,
  Args = exampleDirectiveArgs,
> = DirectiveResolverFn<Result, Parent, ContextType, Args>

export type ActionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Action'] = ResolversParentTypes['Action'],
> = {
  body?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  destinationUrl?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  heroImageUrl?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  inputFields?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>
  organization?: Resolver<
    ResolversTypes['Organization'],
    ParentType,
    ContextType
  >
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  type?: Resolver<ResolversTypes['ActionType'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type ActionConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['ActionConnection'] = ResolversParentTypes['ActionConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['ActionEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['Action']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type ActionEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['ActionEdge'] = ResolversParentTypes['ActionEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<Maybe<ResolversTypes['Action']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type AddressResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Address'] = ResolversParentTypes['Address'],
> = {
  addressLine1?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  addressLine2?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  city?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  country?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  state?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  zip?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type ArgumentResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Argument'] = ResolversParentTypes['Argument'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  measure?: Resolver<ResolversTypes['Measure'], ParentType, ContextType>
  proCon?: Resolver<Maybe<ResolversTypes['Sentiment']>, ParentType, ContextType>
  sourceUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  text?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type BallotResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Ballot'] = ResolversParentTypes['Ballot'],
> = {
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  uuid?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type BallotEventResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['BallotEvent'] = ResolversParentTypes['BallotEvent'],
> = {
  ballot?: Resolver<ResolversTypes['Ballot'], ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  details?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type BodyResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Body'] = ResolversParentTypes['Body'],
> = {
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  geoId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  mtfcc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  shortName?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  state?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type BodyMemberResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['BodyMember'] = ResolversParentTypes['BodyMember'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  type?: Resolver<Maybe<ResolversTypes['Member']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type CandidacyResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Candidacy'] = ResolversParentTypes['Candidacy'],
> = {
  candidate?: Resolver<ResolversTypes['Person'], ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  election?: Resolver<ResolversTypes['Election'], ParentType, ContextType>
  endorsements?: Resolver<
    Array<ResolversTypes['Endorsement']>,
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  isCertified?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  isHidden?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  parties?: Resolver<Array<ResolversTypes['Party']>, ParentType, ContextType>
  position?: Resolver<ResolversTypes['Position'], ParentType, ContextType>
  race?: Resolver<ResolversTypes['Race'], ParentType, ContextType>
  result?: Resolver<
    Maybe<ResolversTypes['ElectionResult']>,
    ParentType,
    ContextType
  >
  stances?: Resolver<Array<ResolversTypes['Stance']>, ParentType, ContextType>
  uncertified?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  withdrawn?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type CandidateUrlResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['CandidateUrl'] = ResolversParentTypes['CandidateUrl'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  entryType?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type ConstituentContactResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['ConstituentContact'] = ResolversParentTypes['ConstituentContact'],
> = {
  address?: Resolver<Maybe<ResolversTypes['Address']>, ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type ContactResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Contact'] = ResolversParentTypes['Contact'],
> = {
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  fax?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  phone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type CreateBallotEventPayloadResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['CreateBallotEventPayload'] = ResolversParentTypes['CreateBallotEventPayload'],
> = {
  ballotEvent?: Resolver<
    Maybe<ResolversTypes['BallotEvent']>,
    ParentType,
    ContextType
  >
  clientMutationId?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  errors?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type CreateBallotPayloadResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['CreateBallotPayload'] = ResolversParentTypes['CreateBallotPayload'],
> = {
  ballot?: Resolver<Maybe<ResolversTypes['Ballot']>, ParentType, ContextType>
  clientMutationId?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  engineToken?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  errors?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type CreateConstituentContactPayloadResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['CreateConstituentContactPayload'] = ResolversParentTypes['CreateConstituentContactPayload'],
> = {
  clientMutationId?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  contact?: Resolver<
    Maybe<ResolversTypes['ConstituentContact']>,
    ParentType,
    ContextType
  >
  errors?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type DatabaseIdentifiableResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['DatabaseIdentifiable'] = ResolversParentTypes['DatabaseIdentifiable'],
> = {
  __resolveType: TypeResolveFn<
    | 'Action'
    | 'Address'
    | 'Argument'
    | 'Ballot'
    | 'BallotEvent'
    | 'Body'
    | 'BodyMember'
    | 'Candidacy'
    | 'CandidateUrl'
    | 'ConstituentContact'
    | 'Degree'
    | 'Election'
    | 'Endorsement'
    | 'Experience'
    | 'FilingPeriod'
    | 'Form'
    | 'Geofence'
    | 'Issue'
    | 'Measure'
    | 'Mtfcc'
    | 'NormalizedPosition'
    | 'OfficeHolder'
    | 'OfficeHolderUrl'
    | 'Organization'
    | 'Party'
    | 'Person'
    | 'Place'
    | 'Position'
    | 'PositionElectionFrequency'
    | 'Race'
    | 'RegistrationOption'
    | 'Stance'
    | 'SuggestedCandidacy'
    | 'Url'
    | 'VotingDay'
    | 'VotingLocation',
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
}

export type DegreeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Degree'] = ResolversParentTypes['Degree'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  degree?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  gradYear?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  major?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  school?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type ElectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Election'] = ResolversParentTypes['Election'],
> = {
  ballotsSentOutBy?: Resolver<
    Maybe<ResolversTypes['ISO8601Date']>,
    ParentType,
    ContextType
  >
  candidateInformationPublishedAt?: Resolver<
    Maybe<ResolversTypes['ISO8601DateTime']>,
    ParentType,
    ContextType
  >
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  defaultTimeZone?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  electionDay?: Resolver<ResolversTypes['ISO8601Date'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  measures?: Resolver<
    ResolversTypes['MeasureConnection'],
    ParentType,
    ContextType,
    Partial<ElectionmeasuresArgs>
  >
  milestones?: Resolver<
    Array<ResolversTypes['Milestone']>,
    ParentType,
    ContextType,
    Partial<ElectionmilestonesArgs>
  >
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  originalElectionDate?: Resolver<
    ResolversTypes['ISO8601Date'],
    ParentType,
    ContextType
  >
  raceCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  races?: Resolver<
    ResolversTypes['RaceConnection'],
    ParentType,
    ContextType,
    Partial<ElectionracesArgs>
  >
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  state?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  timezone?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  vipElections?: Resolver<
    Array<ResolversTypes['VipElection']>,
    ParentType,
    ContextType
  >
  votingDays?: Resolver<
    ResolversTypes['VotingDayConnection'],
    ParentType,
    ContextType,
    Partial<ElectionvotingDaysArgs>
  >
  votingInformationPublishedAt?: Resolver<
    Maybe<ResolversTypes['ISO8601DateTime']>,
    ParentType,
    ContextType
  >
  votingLocations?: Resolver<
    ResolversTypes['VotingLocationConnection'],
    ParentType,
    ContextType,
    Partial<ElectionvotingLocationsArgs>
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type ElectionConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['ElectionConnection'] = ResolversParentTypes['ElectionConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['ElectionEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['Election']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type ElectionEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['ElectionEdge'] = ResolversParentTypes['ElectionEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<Maybe<ResolversTypes['Election']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type EndorsementResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Endorsement'] = ResolversParentTypes['Endorsement'],
> = {
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  endorser?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  organization?: Resolver<
    Maybe<ResolversTypes['Organization']>,
    ParentType,
    ContextType
  >
  recommendation?: Resolver<
    Maybe<ResolversTypes['Sentiment']>,
    ParentType,
    ContextType
  >
  status?: Resolver<
    ResolversTypes['EndorsementStatusTypeField'],
    ParentType,
    ContextType
  >
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type ExperienceResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Experience'] = ResolversParentTypes['Experience'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  end?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  organization?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  start?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type FilingPeriodResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['FilingPeriod'] = ResolversParentTypes['FilingPeriod'],
> = {
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  endOn?: Resolver<
    Maybe<ResolversTypes['ISO8601Date']>,
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  notes?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  startOn?: Resolver<
    Maybe<ResolversTypes['ISO8601Date']>,
    ParentType,
    ContextType
  >
  type?: Resolver<
    Maybe<ResolversTypes['FilingPeriodType']>,
    ParentType,
    ContextType
  >
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type FormResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Form'] = ResolversParentTypes['Form'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  fields?: Resolver<Array<ResolversTypes['FormField']>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  locale?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  type?: Resolver<ResolversTypes['FormType'], ParentType, ContextType>
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type FormFieldResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['FormField'] = ResolversParentTypes['FormField'],
> = {
  isRequired?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  label?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  options?: Resolver<
    Maybe<Array<ResolversTypes['String']>>,
    ParentType,
    ContextType
  >
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type GeofenceResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Geofence'] = ResolversParentTypes['Geofence'],
> = {
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  geoId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  mtfcc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  validFrom?: Resolver<
    Maybe<ResolversTypes['ISO8601Date']>,
    ParentType,
    ContextType
  >
  validTo?: Resolver<
    Maybe<ResolversTypes['ISO8601Date']>,
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type GeographicalIdentifiersResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['GeographicalIdentifiers'] = ResolversParentTypes['GeographicalIdentifiers'],
> = {
  __resolveType: TypeResolveFn<
    'Body' | 'Geofence' | 'Measure' | 'Place' | 'Position' | 'VotingLocation',
    ParentType,
    ContextType
  >
  geoId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  mtfcc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
}

export type HasCandidaciesResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['HasCandidacies'] = ResolversParentTypes['HasCandidacies'],
> = {
  __resolveType: TypeResolveFn<'Person' | 'Race', ParentType, ContextType>
  candidacies?: Resolver<
    Array<ResolversTypes['Candidacy']>,
    ParentType,
    ContextType,
    Partial<HasCandidaciescandidaciesArgs>
  >
}

export type HasOfficeHoldersResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['HasOfficeHolders'] = ResolversParentTypes['HasOfficeHolders'],
> = {
  __resolveType: TypeResolveFn<'Person' | 'Position', ParentType, ContextType>
  officeHolders?: Resolver<
    ResolversTypes['OfficeHolderConnection'],
    ParentType,
    ContextType,
    Partial<HasOfficeHoldersofficeHoldersArgs>
  >
}

export type HasRacesResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['HasRaces'] = ResolversParentTypes['HasRaces'],
> = {
  __resolveType: TypeResolveFn<'Election', ParentType, ContextType>
  raceCount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  races?: Resolver<
    ResolversTypes['RaceConnection'],
    ParentType,
    ContextType,
    Partial<HasRacesracesArgs>
  >
}

export type HeadshotResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Headshot'] = ResolversParentTypes['Headshot'],
> = {
  defaultUrl?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  thumbnailUrl?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export interface ISO8601DateScalarConfig
  extends GraphQLScalarTypeConfig<ResolversTypes['ISO8601Date'], any> {
  name: 'ISO8601Date'
}

export interface ISO8601DateTimeScalarConfig
  extends GraphQLScalarTypeConfig<ResolversTypes['ISO8601DateTime'], any> {
  name: 'ISO8601DateTime'
}

export type ImageUrlResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['ImageUrl'] = ResolversParentTypes['ImageUrl'],
> = {
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type IssueResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Issue'] = ResolversParentTypes['Issue'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  expandedText?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  key?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  parentIssue?: Resolver<
    Maybe<ResolversTypes['Issue']>,
    ParentType,
    ContextType
  >
  pluginEnabled?: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >
  responseType?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  rowOrder?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type IssueConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['IssueConnection'] = ResolversParentTypes['IssueConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['IssueEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['Issue']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type IssueEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['IssueEdge'] = ResolversParentTypes['IssueEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export interface JSONScalarConfig
  extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON'
}

export type MeasureResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Measure'] = ResolversParentTypes['Measure'],
> = {
  arguments?: Resolver<
    Maybe<Array<ResolversTypes['Argument']>>,
    ParentType,
    ContextType
  >
  conSnippet?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  election?: Resolver<ResolversTypes['Election'], ParentType, ContextType>
  endorsements?: Resolver<
    Array<ResolversTypes['Endorsement']>,
    ParentType,
    ContextType
  >
  geoId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  hasUnknownBoundaries?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  issue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>
  mtfcc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  party?: Resolver<ResolversTypes['Party'], ParentType, ContextType>
  proSnippet?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  state?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  summary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  text?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  title?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type MeasureConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['MeasureConnection'] = ResolversParentTypes['MeasureConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['MeasureEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['Measure']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type MeasureEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['MeasureEdge'] = ResolversParentTypes['MeasureEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<Maybe<ResolversTypes['Measure']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type MilestoneResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Milestone'] = ResolversParentTypes['Milestone'],
> = {
  category?: Resolver<
    ResolversTypes['MilestoneCategory'],
    ParentType,
    ContextType
  >
  channel?: Resolver<
    ResolversTypes['MilestoneChannel'],
    ParentType,
    ContextType
  >
  date?: Resolver<ResolversTypes['ISO8601Date'], ParentType, ContextType>
  datetime?: Resolver<
    Maybe<ResolversTypes['ISO8601DateTime']>,
    ParentType,
    ContextType
  >
  features?: Resolver<
    Array<ResolversTypes['MilestoneFeature']>,
    ParentType,
    ContextType
  >
  type?: Resolver<ResolversTypes['MilestoneObject'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type MtfccResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Mtfcc'] = ResolversParentTypes['Mtfcc'],
> = {
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  mtfcc?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type MtfccConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['MtfccConnection'] = ResolversParentTypes['MtfccConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['MtfccEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['Mtfcc']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type MtfccEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['MtfccEdge'] = ResolversParentTypes['MtfccEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<Maybe<ResolversTypes['Mtfcc']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type MutationResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation'],
> = {
  createBallot?: Resolver<
    Maybe<ResolversTypes['CreateBallotPayload']>,
    ParentType,
    ContextType,
    RequireFields<MutationcreateBallotArgs, 'input'>
  >
  createBallotEvent?: Resolver<
    Maybe<ResolversTypes['CreateBallotEventPayload']>,
    ParentType,
    ContextType,
    RequireFields<MutationcreateBallotEventArgs, 'input'>
  >
  createContact?: Resolver<
    Maybe<ResolversTypes['CreateConstituentContactPayload']>,
    ParentType,
    ContextType,
    RequireFields<MutationcreateContactArgs, 'input'>
  >
}

export type NodeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Node'] = ResolversParentTypes['Node'],
> = {
  __resolveType: TypeResolveFn<
    | 'Action'
    | 'Address'
    | 'Argument'
    | 'Ballot'
    | 'BallotEvent'
    | 'Body'
    | 'BodyMember'
    | 'Candidacy'
    | 'CandidateUrl'
    | 'ConstituentContact'
    | 'Degree'
    | 'Election'
    | 'Endorsement'
    | 'Experience'
    | 'FilingPeriod'
    | 'Form'
    | 'Geofence'
    | 'Issue'
    | 'Measure'
    | 'Mtfcc'
    | 'NormalizedPosition'
    | 'OfficeHolder'
    | 'OfficeHolderUrl'
    | 'Organization'
    | 'Party'
    | 'Person'
    | 'Place'
    | 'Position'
    | 'PositionElectionFrequency'
    | 'Race'
    | 'RegistrationOption'
    | 'Stance'
    | 'SuggestedCandidacy'
    | 'VotingDay'
    | 'VotingLocation',
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
}

export type NormalizedPositionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['NormalizedPosition'] = ResolversParentTypes['NormalizedPosition'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  description?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  issues?: Resolver<Array<ResolversTypes['Issue']>, ParentType, ContextType>
  mtfcc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type OfficeHolderResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['OfficeHolder'] = ResolversParentTypes['OfficeHolder'],
> = {
  addresses?: Resolver<
    Array<ResolversTypes['Address']>,
    ParentType,
    ContextType
  >
  centralPhone?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  contacts?: Resolver<Array<ResolversTypes['Contact']>, ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  endAt?: Resolver<
    Maybe<ResolversTypes['ISO8601Date']>,
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  isAppointed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  isCurrent?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  isOffCycle?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  isVacant?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  officePhone?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  officeTitle?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  otherPhone?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  parties?: Resolver<Array<ResolversTypes['Party']>, ParentType, ContextType>
  party?: Resolver<Maybe<ResolversTypes['Party']>, ParentType, ContextType>
  person?: Resolver<Maybe<ResolversTypes['Person']>, ParentType, ContextType>
  position?: Resolver<ResolversTypes['Position'], ParentType, ContextType>
  primaryEmail?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  specificity?: Resolver<
    Maybe<ResolversTypes['DateSpecificity']>,
    ParentType,
    ContextType
  >
  startAt?: Resolver<
    Maybe<ResolversTypes['ISO8601Date']>,
    ParentType,
    ContextType
  >
  totalYearsInOffice?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  urls?: Resolver<
    Array<ResolversTypes['Url']>,
    ParentType,
    ContextType,
    RequireFields<OfficeHolderurlsArgs, 'limit'>
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type OfficeHolderConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['OfficeHolderConnection'] = ResolversParentTypes['OfficeHolderConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['OfficeHolderEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['OfficeHolder']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type OfficeHolderEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['OfficeHolderEdge'] = ResolversParentTypes['OfficeHolderEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<
    Maybe<ResolversTypes['OfficeHolder']>,
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type OfficeHolderUrlResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['OfficeHolderUrl'] = ResolversParentTypes['OfficeHolderUrl'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  entryType?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type OrganizationResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Organization'] = ResolversParentTypes['Organization'],
> = {
  children?: Resolver<
    Array<ResolversTypes['Organization']>,
    ParentType,
    ContextType
  >
  color?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  description?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  issue?: Resolver<Maybe<ResolversTypes['Issue']>, ParentType, ContextType>
  logoUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  parent?: Resolver<
    Maybe<ResolversTypes['Organization']>,
    ParentType,
    ContextType
  >
  retiredAt?: Resolver<
    Maybe<ResolversTypes['ISO8601Date']>,
    ParentType,
    ContextType
  >
  state?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  urls?: Resolver<Array<ResolversTypes['Url']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type OrganizationConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['OrganizationConnection'] = ResolversParentTypes['OrganizationConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['OrganizationEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['Organization']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type OrganizationEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['OrganizationEdge'] = ResolversParentTypes['OrganizationEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<
    Maybe<ResolversTypes['Organization']>,
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PageInfoResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo'],
> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  startCursor?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PartyResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Party'] = ResolversParentTypes['Party'],
> = {
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  shortName?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PersonResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Person'] = ResolversParentTypes['Person'],
> = {
  bioText?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  candidacies?: Resolver<
    Array<ResolversTypes['Candidacy']>,
    ParentType,
    ContextType,
    Partial<PersoncandidaciesArgs>
  >
  contacts?: Resolver<Array<ResolversTypes['Contact']>, ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  degrees?: Resolver<Array<ResolversTypes['Degree']>, ParentType, ContextType>
  email?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  experiences?: Resolver<
    Array<ResolversTypes['Experience']>,
    ParentType,
    ContextType
  >
  firstName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  fullName?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  headshot?: Resolver<ResolversTypes['Headshot'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  images?: Resolver<Array<ResolversTypes['ImageUrl']>, ParentType, ContextType>
  lastName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  middleName?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  nickname?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  officeHolders?: Resolver<
    ResolversTypes['OfficeHolderConnection'],
    ParentType,
    ContextType,
    Partial<PersonofficeHoldersArgs>
  >
  phone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  suffix?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  urls?: Resolver<
    Array<ResolversTypes['Url']>,
    ParentType,
    ContextType,
    RequireFields<PersonurlsArgs, 'limit'>
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PersonConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['PersonConnection'] = ResolversParentTypes['PersonConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['PersonEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['Person']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PersonEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['PersonEdge'] = ResolversParentTypes['PersonEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<Maybe<ResolversTypes['Person']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PlaceResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Place'] = ResolversParentTypes['Place'],
> = {
  addresses?: Resolver<
    Array<ResolversTypes['Address']>,
    ParentType,
    ContextType,
    Partial<PlaceaddressesArgs>
  >
  canVoteInPrimaryWhen18ByGeneral?: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >
  contacts?: Resolver<Array<ResolversTypes['Contact']>, ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  dissolved?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  forms?: Resolver<
    Array<ResolversTypes['Form']>,
    ParentType,
    ContextType,
    Partial<PlaceformsArgs>
  >
  geoId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  hasVoteByMail?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  isPrintingEnabled?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType
  >
  isReceiverOfVoteByMailRequests?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType
  >
  mtfcc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  positions?: Resolver<
    ResolversTypes['PositionConnection'],
    ParentType,
    ContextType,
    Partial<PlacepositionsArgs>
  >
  primaryType?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  registrationOptions?: Resolver<
    Array<ResolversTypes['RegistrationOption']>,
    ParentType,
    ContextType
  >
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  state?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  timezone?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  urls?: Resolver<Array<ResolversTypes['Url']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PlaceConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['PlaceConnection'] = ResolversParentTypes['PlaceConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['PlaceEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['Place']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PlaceEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['PlaceEdge'] = ResolversParentTypes['PlaceEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<Maybe<ResolversTypes['Place']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PositionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Position'] = ResolversParentTypes['Position'],
> = {
  appointed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  description?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  electionFrequencies?: Resolver<
    Array<ResolversTypes['PositionElectionFrequency']>,
    ParentType,
    ContextType
  >
  eligibilityRequirements?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  employmentType?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  filingAddress?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  filingPhone?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  filingRequirements?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  geoId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  hasMajorityVotePrimary?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType
  >
  hasPrimary?: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >
  hasRankedChoiceGeneral?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType
  >
  hasRankedChoicePrimary?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType
  >
  hasUnknownBoundaries?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  issues?: Resolver<Array<ResolversTypes['Issue']>, ParentType, ContextType>
  judicial?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  level?: Resolver<ResolversTypes['PositionLevel'], ParentType, ContextType>
  maximumFilingFee?: Resolver<
    Maybe<ResolversTypes['Float']>,
    ParentType,
    ContextType
  >
  minimumAge?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>
  mtfcc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  mustBeRegisteredVoter?: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >
  mustBeResident?: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >
  mustHaveProfessionalExperience?: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  normalizedPosition?: Resolver<
    ResolversTypes['NormalizedPosition'],
    ParentType,
    ContextType
  >
  officeHolders?: Resolver<
    ResolversTypes['OfficeHolderConnection'],
    ParentType,
    ContextType,
    Partial<PositionofficeHoldersArgs>
  >
  paperworkInstructions?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  partisanType?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  places?: Resolver<
    ResolversTypes['PlaceConnection'],
    ParentType,
    ContextType,
    Partial<PositionplacesArgs>
  >
  races?: Resolver<
    ResolversTypes['RaceConnection'],
    ParentType,
    ContextType,
    Partial<PositionracesArgs>
  >
  rankedChoiceMaxVotesGeneral?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >
  rankedChoiceMaxVotesPrimary?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >
  retention?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  rowOrder?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  runningMateStyle?: Resolver<
    Maybe<ResolversTypes['RunningMate']>,
    ParentType,
    ContextType
  >
  salary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  seats?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  selectionsAllowed?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  staggeredTerm?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  state?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  subAreaName?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  subAreaValue?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  tier?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PositionConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['PositionConnection'] = ResolversParentTypes['PositionConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['PositionEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['Position']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PositionEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['PositionEdge'] = ResolversParentTypes['PositionEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  isContained?: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >
  node?: Resolver<Maybe<ResolversTypes['Position']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type PositionElectionFrequencyResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['PositionElectionFrequency'] = ResolversParentTypes['PositionElectionFrequency'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  frequency?: Resolver<Array<ResolversTypes['Int']>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  position?: Resolver<ResolversTypes['Position'], ParentType, ContextType>
  referenceYear?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  seats?: Resolver<Maybe<Array<ResolversTypes['Int']>>, ParentType, ContextType>
  validFrom?: Resolver<ResolversTypes['ISO8601Date'], ParentType, ContextType>
  validTo?: Resolver<
    Maybe<ResolversTypes['ISO8601Date']>,
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type QueryResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Query'] = ResolversParentTypes['Query'],
> = {
  actions?: Resolver<
    ResolversTypes['ActionConnection'],
    ParentType,
    ContextType,
    Partial<QueryactionsArgs>
  >
  complexity?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  elections?: Resolver<
    ResolversTypes['ElectionConnection'],
    ParentType,
    ContextType,
    Partial<QueryelectionsArgs>
  >
  issues?: Resolver<
    ResolversTypes['IssueConnection'],
    ParentType,
    ContextType,
    Partial<QueryissuesArgs>
  >
  measures?: Resolver<
    ResolversTypes['MeasureConnection'],
    ParentType,
    ContextType,
    Partial<QuerymeasuresArgs>
  >
  mtfcc?: Resolver<
    ResolversTypes['MtfccConnection'],
    ParentType,
    ContextType,
    Partial<QuerymtfccArgs>
  >
  node?: Resolver<
    Maybe<ResolversTypes['Node']>,
    ParentType,
    ContextType,
    RequireFields<QuerynodeArgs, 'id'>
  >
  nodeBySlug?: Resolver<
    Maybe<ResolversTypes['Node']>,
    ParentType,
    ContextType,
    RequireFields<QuerynodeBySlugArgs, 'objectType' | 'slug'>
  >
  nodes?: Resolver<
    Array<Maybe<ResolversTypes['Node']>>,
    ParentType,
    ContextType,
    RequireFields<QuerynodesArgs, 'ids'>
  >
  officeHolders?: Resolver<
    ResolversTypes['OfficeHolderConnection'],
    ParentType,
    ContextType,
    Partial<QueryofficeHoldersArgs>
  >
  organizations?: Resolver<
    ResolversTypes['OrganizationConnection'],
    ParentType,
    ContextType,
    Partial<QueryorganizationsArgs>
  >
  people?: Resolver<
    ResolversTypes['PersonConnection'],
    ParentType,
    ContextType,
    Partial<QuerypeopleArgs>
  >
  places?: Resolver<
    ResolversTypes['PlaceConnection'],
    ParentType,
    ContextType,
    Partial<QueryplacesArgs>
  >
  positions?: Resolver<
    ResolversTypes['PositionConnection'],
    ParentType,
    ContextType,
    Partial<QuerypositionsArgs>
  >
  races?: Resolver<
    ResolversTypes['RaceConnection'],
    ParentType,
    ContextType,
    Partial<QueryracesArgs>
  >
  votingLocations?: Resolver<
    ResolversTypes['VotingLocationConnection'],
    ParentType,
    ContextType,
    RequireFields<QueryvotingLocationsArgs, 'filterBy'>
  >
}

export type RaceResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Race'] = ResolversParentTypes['Race'],
> = {
  candidacies?: Resolver<
    Array<ResolversTypes['Candidacy']>,
    ParentType,
    ContextType,
    Partial<RacecandidaciesArgs>
  >
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  election?: Resolver<ResolversTypes['Election'], ParentType, ContextType>
  filingPeriods?: Resolver<
    Array<ResolversTypes['FilingPeriod']>,
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  isDisabled?: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >
  isPartisan?: Resolver<
    Maybe<ResolversTypes['Boolean']>,
    ParentType,
    ContextType
  >
  isPrimary?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  isRecall?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  isRunoff?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  isUnexpired?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  position?: Resolver<ResolversTypes['Position'], ParentType, ContextType>
  seats?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type RaceConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['RaceConnection'] = ResolversParentTypes['RaceConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['RaceEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['Race']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type RaceEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['RaceEdge'] = ResolversParentTypes['RaceEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<Maybe<ResolversTypes['Race']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type RegistrationOptionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['RegistrationOption'] = ResolversParentTypes['RegistrationOption'],
> = {
  availableIfDateOfBirthBeforeOrEquals?: Resolver<
    Maybe<ResolversTypes['ISO8601Date']>,
    ParentType,
    ContextType
  >
  channel?: Resolver<
    ResolversTypes['RegistrationOptionChannel'],
    ParentType,
    ContextType
  >
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  documents?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>
  eligibility?: Resolver<
    Array<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  features?: Resolver<
    Array<ResolversTypes['RegistrationOptionFeature']>,
    ParentType,
    ContextType
  >
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  isIdRequired?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  isPreregistration?: Resolver<
    ResolversTypes['Boolean'],
    ParentType,
    ContextType
  >
  place?: Resolver<ResolversTypes['Place'], ParentType, ContextType>
  safestRegistrationDeadlineInDays?: Resolver<
    Maybe<ResolversTypes['Int']>,
    ParentType,
    ContextType
  >
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type SlugResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Slug'] = ResolversParentTypes['Slug'],
> = {
  __resolveType: TypeResolveFn<
    'Action' | 'Election' | 'Measure' | 'Person' | 'Place' | 'Position',
    ParentType,
    ContextType
  >
  slug?: Resolver<ResolversTypes['String'], ParentType, ContextType>
}

export type StanceResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Stance'] = ResolversParentTypes['Stance'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  issue?: Resolver<ResolversTypes['Issue'], ParentType, ContextType>
  locale?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  referenceUrl?: Resolver<
    Maybe<ResolversTypes['String']>,
    ParentType,
    ContextType
  >
  statement?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type SuggestedCandidacyResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['SuggestedCandidacy'] = ResolversParentTypes['SuggestedCandidacy'],
> = {
  candidate?: Resolver<Maybe<ResolversTypes['Person']>, ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  election?: Resolver<ResolversTypes['Election'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  organization?: Resolver<
    Maybe<ResolversTypes['Organization']>,
    ParentType,
    ContextType
  >
  parties?: Resolver<Array<ResolversTypes['Party']>, ParentType, ContextType>
  position?: Resolver<ResolversTypes['Position'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type TimestampsResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['Timestamps'] = ResolversParentTypes['Timestamps'],
> = {
  __resolveType: TypeResolveFn<
    | 'Action'
    | 'Address'
    | 'Ballot'
    | 'BallotEvent'
    | 'Body'
    | 'Candidacy'
    | 'ConstituentContact'
    | 'Election'
    | 'Endorsement'
    | 'FilingPeriod'
    | 'Geofence'
    | 'Measure'
    | 'Mtfcc'
    | 'OfficeHolder'
    | 'Organization'
    | 'Party'
    | 'Person'
    | 'Place'
    | 'Position'
    | 'Race'
    | 'RegistrationOption'
    | 'SuggestedCandidacy'
    | 'VotingDay'
    | 'VotingLocation',
    ParentType,
    ContextType
  >
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
}

export type UrlResolvers<
  ContextType = any,
  ParentType extends ResolversParentTypes['Url'] = ResolversParentTypes['Url'],
> = {
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type VipElectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['VipElection'] = ResolversParentTypes['VipElection'],
> = {
  party?: Resolver<Maybe<ResolversTypes['Party']>, ParentType, ContextType>
  vipId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type VotingDayResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['VotingDay'] = ResolversParentTypes['VotingDay'],
> = {
  closeAt?: Resolver<ResolversTypes['ISO8601DateTime'], ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  isDropOff?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  isEarlyVoting?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  isInPerson?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>
  openAt?: Resolver<ResolversTypes['ISO8601DateTime'], ParentType, ContextType>
  timezone?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type VotingDayConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['VotingDayConnection'] = ResolversParentTypes['VotingDayConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['VotingDayEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['VotingDay']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type VotingDayEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['VotingDayEdge'] = ResolversParentTypes['VotingDayEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<Maybe<ResolversTypes['VotingDay']>, ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type VotingLocationResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['VotingLocation'] = ResolversParentTypes['VotingLocation'],
> = {
  address?: Resolver<Maybe<ResolversTypes['Address']>, ParentType, ContextType>
  createdAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  databaseId?: Resolver<ResolversTypes['Int'], ParentType, ContextType>
  election?: Resolver<ResolversTypes['Election'], ParentType, ContextType>
  geoId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>
  mtfcc?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  party?: Resolver<Maybe<ResolversTypes['Party']>, ParentType, ContextType>
  precinct?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>
  timezone?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  updatedAt?: Resolver<
    ResolversTypes['ISO8601DateTime'],
    ParentType,
    ContextType
  >
  votingDays?: Resolver<
    ResolversTypes['VotingDayConnection'],
    ParentType,
    ContextType,
    Partial<VotingLocationvotingDaysArgs>
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type VotingLocationConnectionResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['VotingLocationConnection'] = ResolversParentTypes['VotingLocationConnection'],
> = {
  edges?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['VotingLocationEdge']>>>,
    ParentType,
    ContextType
  >
  nodes?: Resolver<
    Maybe<Array<Maybe<ResolversTypes['VotingLocation']>>>,
    ParentType,
    ContextType
  >
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type VotingLocationEdgeResolvers<
  ContextType = any,
  ParentType extends
    ResolversParentTypes['VotingLocationEdge'] = ResolversParentTypes['VotingLocationEdge'],
> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>
  node?: Resolver<
    Maybe<ResolversTypes['VotingLocation']>,
    ParentType,
    ContextType
  >
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>
}

export type Resolvers<ContextType = any> = {
  Action?: ActionResolvers<ContextType>
  ActionConnection?: ActionConnectionResolvers<ContextType>
  ActionEdge?: ActionEdgeResolvers<ContextType>
  Address?: AddressResolvers<ContextType>
  Argument?: ArgumentResolvers<ContextType>
  Ballot?: BallotResolvers<ContextType>
  BallotEvent?: BallotEventResolvers<ContextType>
  Body?: BodyResolvers<ContextType>
  BodyMember?: BodyMemberResolvers<ContextType>
  Candidacy?: CandidacyResolvers<ContextType>
  CandidateUrl?: CandidateUrlResolvers<ContextType>
  ConstituentContact?: ConstituentContactResolvers<ContextType>
  Contact?: ContactResolvers<ContextType>
  CreateBallotEventPayload?: CreateBallotEventPayloadResolvers<ContextType>
  CreateBallotPayload?: CreateBallotPayloadResolvers<ContextType>
  CreateConstituentContactPayload?: CreateConstituentContactPayloadResolvers<ContextType>
  DatabaseIdentifiable?: DatabaseIdentifiableResolvers<ContextType>
  Degree?: DegreeResolvers<ContextType>
  Election?: ElectionResolvers<ContextType>
  ElectionConnection?: ElectionConnectionResolvers<ContextType>
  ElectionEdge?: ElectionEdgeResolvers<ContextType>
  Endorsement?: EndorsementResolvers<ContextType>
  Experience?: ExperienceResolvers<ContextType>
  FilingPeriod?: FilingPeriodResolvers<ContextType>
  Form?: FormResolvers<ContextType>
  FormField?: FormFieldResolvers<ContextType>
  Geofence?: GeofenceResolvers<ContextType>
  GeographicalIdentifiers?: GeographicalIdentifiersResolvers<ContextType>
  HasCandidacies?: HasCandidaciesResolvers<ContextType>
  HasOfficeHolders?: HasOfficeHoldersResolvers<ContextType>
  HasRaces?: HasRacesResolvers<ContextType>
  Headshot?: HeadshotResolvers<ContextType>
  ISO8601Date?: GraphQLScalarType
  ISO8601DateTime?: GraphQLScalarType
  ImageUrl?: ImageUrlResolvers<ContextType>
  Issue?: IssueResolvers<ContextType>
  IssueConnection?: IssueConnectionResolvers<ContextType>
  IssueEdge?: IssueEdgeResolvers<ContextType>
  JSON?: GraphQLScalarType
  Measure?: MeasureResolvers<ContextType>
  MeasureConnection?: MeasureConnectionResolvers<ContextType>
  MeasureEdge?: MeasureEdgeResolvers<ContextType>
  Milestone?: MilestoneResolvers<ContextType>
  Mtfcc?: MtfccResolvers<ContextType>
  MtfccConnection?: MtfccConnectionResolvers<ContextType>
  MtfccEdge?: MtfccEdgeResolvers<ContextType>
  Mutation?: MutationResolvers<ContextType>
  Node?: NodeResolvers<ContextType>
  NormalizedPosition?: NormalizedPositionResolvers<ContextType>
  OfficeHolder?: OfficeHolderResolvers<ContextType>
  OfficeHolderConnection?: OfficeHolderConnectionResolvers<ContextType>
  OfficeHolderEdge?: OfficeHolderEdgeResolvers<ContextType>
  OfficeHolderUrl?: OfficeHolderUrlResolvers<ContextType>
  Organization?: OrganizationResolvers<ContextType>
  OrganizationConnection?: OrganizationConnectionResolvers<ContextType>
  OrganizationEdge?: OrganizationEdgeResolvers<ContextType>
  PageInfo?: PageInfoResolvers<ContextType>
  Party?: PartyResolvers<ContextType>
  Person?: PersonResolvers<ContextType>
  PersonConnection?: PersonConnectionResolvers<ContextType>
  PersonEdge?: PersonEdgeResolvers<ContextType>
  Place?: PlaceResolvers<ContextType>
  PlaceConnection?: PlaceConnectionResolvers<ContextType>
  PlaceEdge?: PlaceEdgeResolvers<ContextType>
  Position?: PositionResolvers<ContextType>
  PositionConnection?: PositionConnectionResolvers<ContextType>
  PositionEdge?: PositionEdgeResolvers<ContextType>
  PositionElectionFrequency?: PositionElectionFrequencyResolvers<ContextType>
  Query?: QueryResolvers<ContextType>
  Race?: RaceResolvers<ContextType>
  RaceConnection?: RaceConnectionResolvers<ContextType>
  RaceEdge?: RaceEdgeResolvers<ContextType>
  RegistrationOption?: RegistrationOptionResolvers<ContextType>
  Slug?: SlugResolvers<ContextType>
  Stance?: StanceResolvers<ContextType>
  SuggestedCandidacy?: SuggestedCandidacyResolvers<ContextType>
  Timestamps?: TimestampsResolvers<ContextType>
  Url?: UrlResolvers<ContextType>
  VipElection?: VipElectionResolvers<ContextType>
  VotingDay?: VotingDayResolvers<ContextType>
  VotingDayConnection?: VotingDayConnectionResolvers<ContextType>
  VotingDayEdge?: VotingDayEdgeResolvers<ContextType>
  VotingLocation?: VotingLocationResolvers<ContextType>
  VotingLocationConnection?: VotingLocationConnectionResolvers<ContextType>
  VotingLocationEdge?: VotingLocationEdgeResolvers<ContextType>
}

export type DirectiveResolvers<ContextType = any> = {
  example?: exampleDirectiveResolver<any, any, ContextType>
}
