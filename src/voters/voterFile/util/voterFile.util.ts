import { CampaignWith } from 'src/campaigns/campaigns.types'
import { GetVoterFileSchema } from '../schemas/GetVoterFile.schema'
import {
  CustomFilter,
  CustomVoterFile,
  VoterFileType,
} from '../voterFile.types'
import { PinoLogger } from 'nestjs-pino'

const VOTER_FILE_LATEST_EVEN_YEAR = Number(
  process.env.VOTER_FILE_LATEST_EVEN_YEAR,
)
const VOTER_FILE_LATEST_ODD_YEAR = Number(
  process.env.VOTER_FILE_LATEST_ODD_YEAR,
)

const VOTER_FILE_YEARS_LENGTH = Number(process.env.VOTER_FILE_YEARS_LENGTH)

if (
  !VOTER_FILE_LATEST_EVEN_YEAR ||
  !VOTER_FILE_LATEST_ODD_YEAR ||
  !VOTER_FILE_YEARS_LENGTH
) {
  throw new Error(
    'Please update your .env with VOTER_FILE_LATEST_EVEN_YEAR, VOTER_FILE_LATEST_ODD_YEAR and VOTER_FILE_YEARS_LENGTH',
  )
}

// TODO: This is an absolute MESS. Building raw queries like this is absolutely a
//  recipe for disaster and the cyclomatic complexity here is off the charts ridiculous.
//  We should NOT be querying the Voter DB directly like this.  We need to be calling
//  the PeopleAPI to fetch the segment of voters we want. Rip this out and replace
//  it with a call to the PeopleAPI: https://goodparty.clickup.com/t/90132012119/ENG-5032
export function typeToQuery(
  logger: PinoLogger,
  type: VoterFileType,
  campaign: CampaignWith<'pathToVictory'>,
  customFilters?: Pick<CustomVoterFile, 'channel' | 'filters' | 'purpose'>,
  justCount?: boolean,
  fixColumns?: boolean,
  selectedColumns?: GetVoterFileSchema['selectedColumns'],
  limit?: number,
) {
  const state = campaign.details.state
  const electionDate: string | undefined = campaign.details?.electionDate
  const electionYear = electionDate
    ? Number(String(electionDate).slice(0, 4))
    : undefined
  const isEvenElectionYear =
    typeof electionYear === 'number' ? electionYear % 2 === 0 : true
  let whereClause = ''
  let nestedWhereClause = ''
  let l2ColumnName = campaign.pathToVictory?.data.electionType
  const l2ColumnValue = campaign.pathToVictory?.data.electionLocation

  logger.debug(
    `Building query: state=${state}, electionType=${l2ColumnName}, electionLocation=${l2ColumnValue}`,
  )

  // For statewide offices (electionType === 'State'), we skip the district filter.
  // The voter tables are already state-specific (e.g., VoterCO), so querying that
  // table already targets voters in that state and we don't need to filter by district
  const isStatewideOffice = l2ColumnName === 'State'

  if (!isStatewideOffice && (!l2ColumnName || !l2ColumnValue)) {
    logger.warn(
      `Missing L2 data for campaign ${campaign.id}. l2ColumnName: ${l2ColumnName}, l2ColumnValue: ${l2ColumnValue}`,
    )
    throw new Error(
      'L2 data is required to generate voter file. Please ensure the campaign has been processed by PathToVictory and contains electionType and electionLocation data.',
    )
  }

  if (l2ColumnName && l2ColumnValue && !isStatewideOffice) {
    // value is like "IN##CLARK##CLARK CNTY COMM DIST 1" we need just CLARK CNTY COMM DIST 1
    const cleanValue = extractLocation(logger, l2ColumnValue, fixColumns)
    if (fixColumns) {
      logger.debug({ l2ColumnName }, 'before fix columns:')
      l2ColumnName = fixCityCountyColumns(l2ColumnName)
      logger.debug({ l2ColumnName }, 'after fix columns:')
    }
    if (cleanValue) {
      whereClause += `("${l2ColumnName}" = '${cleanValue}'
      OR "${l2ColumnName}" = '${cleanValue} (EST.)'
      OR "${l2ColumnName}" = '${cleanValue.replace(/^0/, '')}') `
    }
  } else if (isStatewideOffice) {
    logger.debug('Statewide office - skipping district filter')
  }

  let columns: string
  if (selectedColumns?.length) {
    // Use selected columns
    columns = selectedColumns.map((col) => `"${col.db}"`).join(', ')
  } else if (type === 'full') {
    columns = `"LALVOTERID",
    "Voters_FirstName",
    "Voters_LastName",
    "Parties_Description",
    "Voters_Gender",
    "Voters_Age",
    "Voters_VotingPerformanceEvenYearGeneral",
    "Voters_VotingPerformanceEvenYearPrimary",
    "Voters_VotingPerformanceEvenYearGeneralAndPrimary",
    "Residence_Addresses_ApartmentType",
    "EthnicGroups_EthnicGroup1Desc",
    "Residence_Addresses_Latitude",
    "Residence_Addresses_Longitude",
    "Residence_HHParties_Description",
    "Mailing_Families_HHCount",
    "Voters_SequenceOddEven",
    "VoterTelephones_CellPhoneFormatted",
    "VoterTelephones_CellConfidenceCode",
    "VoterParties_Change_Changed_Party",
    "Languages_Description",
    "Residence_Addresses_AddressLine",
    "Residence_Addresses_ExtraAddressLine",
    "Residence_Addresses_HouseNumber",
    "Residence_Addresses_City",
    "Residence_Addresses_State",
    "Residence_Addresses_Zip",
    "Residence_Addresses_ZipPlus4",
    "Mailing_Addresses_AddressLine",
    "Mailing_Addresses_ExtraAddressLine",
    "Mailing_Addresses_City",
    "Mailing_Addresses_State",
    "Mailing_Addresses_Zip",
    "Mailing_Addresses_ZipPlus4",
    "Mailing_Addresses_DPBC",
    "Mailing_Addresses_CheckDigit",
    "Mailing_Addresses_HouseNumber",
    "Mailing_Addresses_PrefixDirection",
    "Mailing_Addresses_StreetName",
    "Mailing_Addresses_Designator",
    "Mailing_Addresses_SuffixDirection",
    "Mailing_Addresses_ApartmentNum",
    "Mailing_Addresses_ApartmentType",
    "MaritalStatus_Description",
    "Mailing_Families_FamilyID",
    "Mailing_Families_HHCount",
    "Mailing_HHParties_Description",
    "MilitaryStatus_Description"`

    const buildYearColumns = (latest: number) => {
      const years: number[] = []
      for (let y = latest; years.length < VOTER_FILE_YEARS_LENGTH; y -= 2)
        years.push(y)
      return years
    }

    const generalYears = buildYearColumns(
      isEvenElectionYear
        ? VOTER_FILE_LATEST_EVEN_YEAR
        : VOTER_FILE_LATEST_ODD_YEAR,
    )
    const primaryYears = generalYears

    const generalCols = generalYears
      .map((y) =>
        isEvenElectionYear ? `"General_${y}"` : `"AnyElection_${y}"`,
      )
      .join(', ')
    const primaryCols = isEvenElectionYear
      ? primaryYears.map((y) => `"Primary_${y}"`).join(', ')
      : ''

    const columnsSuffix = isEvenElectionYear
      ? `,
    ${generalCols},
    ${primaryCols}`
      : `,
    ${generalCols}`

    columns += columnsSuffix
  } else {
    columns = `"LALVOTERID",
    "Voters_FirstName",
    "Voters_LastName",
    "Parties_Description",
    "Voters_Gender",
    "Voters_Age"`

    if (type === 'doorKnocking') {
      columns += `, "Residence_Addresses_Latitude",
      "Residence_Addresses_Longitude",
      "Residence_Addresses_AddressLine",
      "Residence_Addresses_ExtraAddressLine",
      "Residence_Addresses_HouseNumber",
      "Residence_Addresses_City",
      "Residence_Addresses_State",
      "Residence_Addresses_Zip"`
    }

    if (type === 'digitalAds') {
      columns += `, "VoterTelephones_CellPhoneFormatted",
      "Residence_Addresses_AddressLine",
      "Residence_Addresses_ExtraAddressLine",
      "Residence_Addresses_HouseNumber",
      "Residence_Addresses_City",
      "Residence_Addresses_State",
      "Residence_Addresses_Zip"`

      whereClause += `${whereClause ? ' AND ' : ''}"VoterTelephones_CellPhoneFormatted" IS NOT NULL`
    }

    if (type === 'directMail') {
      columns += `, "Mailing_Addresses_AddressLine",
      "Mailing_Addresses_ExtraAddressLine",
      "Mailing_Addresses_City",
      "Mailing_Addresses_State",
      "Mailing_Addresses_Zip",
      "Mailing_Addresses_ZipPlus4",
      "Mailing_Families_HHCount"`

      nestedWhereClause = 'a'
      if (whereClause !== '') {
        whereClause += ' AND '
      }

      whereClause += ` EXISTS (
        SELECT 1
        FROM public."Voter${state}" b
        WHERE a."Mailing_Families_FamilyID" = b."Mailing_Families_FamilyID"
        GROUP BY b."Mailing_Families_FamilyID"
        HAVING COUNT(*) = 1
      )`
    }

    if (type === 'telemarketing' || type === 'robocall') {
      columns += `, "VoterTelephones_LandlineFormatted",
      "Languages_Description"`

      whereClause += ` ${whereClause ? 'AND' : ''} "VoterTelephones_LandlineFormatted" IS NOT NULL`
    }
  }

  if (type === 'sms') {
    columns += `, "VoterTelephones_CellPhoneFormatted"`
    if (whereClause) {
      whereClause += ` AND "VoterTelephones_CellPhoneFormatted" IS NOT NULL`
    } else {
      whereClause += `"VoterTelephones_CellPhoneFormatted" IS NOT NULL`
    }
  }

  if (customFilters?.filters && customFilters.filters.length > 0) {
    const customFiltersQuery = customFiltersToQuery(customFilters.filters)
    if (whereClause !== '') {
      whereClause += ' AND ' + customFiltersQuery
    } else {
      whereClause += customFiltersQuery
    }
  }

  return `SELECT ${justCount ? 'COUNT(*)' : columns} FROM public."Voter${state}" ${nestedWhereClause} ${
    whereClause !== ''
      ? `WHERE ${whereClause} ${limit ? `LIMIT ${limit}` : ''}`
      : ''
  }`
}

function extractLocation(
  logger: PinoLogger,
  input: string,
  fixColumns?: boolean,
) {
  logger.debug(
    `Extracting location from: ${input} ${
      fixColumns ? '- with fixColumns' : ''
    }`,
  )
  // ## denotes the old raw values coming from L2. If that's not present, we
  //  don't need to do anything, it's already been normalized by our ETL pipeline.
  if (!input.includes('##')) {
    return input
  }

  // TODO: Figure out if we even need this.
  //  I'm not event sure this works anymore. Given the example in typeToQuery,
  //  "IN##CLARK##CLARK CNTY COMM DIST 1", this doesn't return "CLARK CNTY COMM DIST 1".
  //  It just returns "CLARK": https://codesandbox.io/p/sandbox/4rs4vq
  const extracted = input.replace(/##$/, '')

  const res = extracted
    ?.split('##')
    ?.at(fixColumns ? 1 : -1)
    ?.replace(' (EST.)', '')
  logger.debug({ res }, 'Extracted:')
  return res
}

function fixCityCountyColumns(value: string) {
  if (value.startsWith('City_')) {
    return 'City'
  }
  if (value.startsWith('County_')) {
    return 'County'
  }
  return value
}

function customFiltersToQuery(filters: CustomFilter[]) {
  const filterConditions: { [key: string]: string[] } = {
    audience: [],
    party: [],
    age: [],
    gender: [],
  }

  filters.forEach((filter) => {
    switch (filter) {
      case 'audience_superVoters':
        filterConditions.audience.push(`CASE
                                          WHEN "Voters_VotingPerformanceEvenYearGeneral" ~ '^[0-9]+%$'
                                          THEN CAST(REPLACE("Voters_VotingPerformanceEvenYearGeneral", '%', '') AS numeric)
                                          ELSE NULL
                                        END > 75`)
        break
      case 'audience_likelyVoters':
        filterConditions.audience.push(`(CASE
                                          WHEN "Voters_VotingPerformanceEvenYearGeneral" ~ '^[0-9]+%$'
                                          THEN CAST(REPLACE("Voters_VotingPerformanceEvenYearGeneral", '%', '') AS numeric)
                                          ELSE NULL
                                        END > 50 AND
                                        CASE
                                          WHEN "Voters_VotingPerformanceEvenYearGeneral" ~ '^[0-9]+%$'
                                          THEN CAST(REPLACE("Voters_VotingPerformanceEvenYearGeneral", '%', '') AS numeric)
                                          ELSE NULL
                                        END <= 75)`)
        break
      case 'audience_unreliableVoters':
        filterConditions.audience.push(`(CASE
                                          WHEN "Voters_VotingPerformanceEvenYearGeneral" ~ '^[0-9]+%$'
                                          THEN CAST(REPLACE("Voters_VotingPerformanceEvenYearGeneral", '%', '') AS numeric)
                                          ELSE NULL
                                        END > 25 AND
                                        CASE
                                          WHEN "Voters_VotingPerformanceEvenYearGeneral" ~ '^[0-9]+%$'
                                          THEN CAST(REPLACE("Voters_VotingPerformanceEvenYearGeneral", '%', '') AS numeric)
                                          ELSE NULL
                                        END <= 50)`)
        break
      case 'audience_unlikelyVoters':
        filterConditions.audience.push(`(CASE
                                              WHEN "Voters_VotingPerformanceEvenYearGeneral" ~ '^[0-9]+%$'
                                              THEN CAST(REPLACE("Voters_VotingPerformanceEvenYearGeneral", '%', '') AS numeric)
                                              ELSE NULL
                                            END > 1 AND
                                            CASE
                                              WHEN "Voters_VotingPerformanceEvenYearGeneral" ~ '^[0-9]+%$'
                                              THEN CAST(REPLACE("Voters_VotingPerformanceEvenYearGeneral", '%', '') AS numeric)
                                              ELSE NULL
                                            END <= 25)`)
        break
      case 'audience_firstTimeVoters':
        filterConditions.audience.push(
          `"Voters_VotingPerformanceEvenYearGeneral" IN ('0%', 'Not Eligible', '')`,
        )
        break
      case 'party_independent':
        filterConditions.party.push(
          '("Parties_Description" = \'Non-Partisan\' OR "Parties_Description" = \'Other\')',
        )
        break
      case 'party_democrat':
        filterConditions.party.push('"Parties_Description" = \'Democratic\'')
        break
      case 'party_republican':
        filterConditions.party.push('"Parties_Description" = \'Republican\'')
        break
      case 'age_18_25':
        filterConditions.age.push(
          '("Voters_Age"::integer >= 18 AND "Voters_Age"::integer <= 25)',
        )
        break
      case 'age_25_35':
        filterConditions.age.push(
          '("Voters_Age"::integer > 25 AND "Voters_Age"::integer <= 35)',
        )
        break
      case 'age_35_50':
        filterConditions.age.push(
          '("Voters_Age"::integer > 35 AND "Voters_Age"::integer <= 50)',
        )
        break
      case 'age_50_plus':
        filterConditions.age.push('"Voters_Age"::integer > 50')
        break
      case 'gender_male':
        filterConditions.gender.push('"Voters_Gender" = \'M\'')
        break
      case 'gender_female':
        filterConditions.gender.push('"Voters_Gender" = \'F\'')
        break
      case 'gender_unknown':
        filterConditions.gender.push('"Voters_Gender" IS NULL')
        break
    }
  })

  // Combine conditions for each category with OR and wrap them in parentheses
  const audienceCondition = filterConditions.audience.length
    ? `(${filterConditions.audience.join(' OR ')})`
    : null
  const partyCondition = filterConditions.party.length
    ? `(${filterConditions.party.join(' OR ')})`
    : null
  const ageCondition = filterConditions.age.length
    ? `(${filterConditions.age.join(' OR ')})`
    : null
  const genderCondition = filterConditions.gender.length
    ? `(${filterConditions.gender.join(' OR ')})`
    : null

  // Combine all categories with AND
  const finalCondition = [
    audienceCondition,
    partyCondition,
    ageCondition,
    genderCondition,
  ]
    .filter(Boolean)
    .join(' AND ')

  return finalCondition ? ` ${finalCondition}` : ''
}
