import { ElectionLevel } from '@/campaigns/campaigns.types'
import { Injectable, Logger } from '@nestjs/common'
import { getYear } from 'date-fns'
import {
  ChatCompletionNamedToolChoice,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { AiChatMessage } from 'src/campaigns/ai/chat/aiChat.types'
import { ElectionsService } from 'src/elections/services/elections.service'
import { parseJsonString } from 'src/shared/util/zod.util'
import { z } from 'zod'
import { AiService } from '../../ai/ai.service'
import { PrismaService } from '../../prisma/prisma.service'
import { SlackService } from '../../vendors/slack/services/slack.service'
import { SlackChannel } from '../../vendors/slack/slackService.types'

interface SearchColumnResult {
  column: string
  value: string
}

// -------------------------
// Constants and Enums
// -------------------------

enum OfficeCategory {
  Judicial = 'Judicial',
  Education = 'Education',
  City = 'City',
  County = 'County',
  State = 'State',
}

const ELECTION_LEVEL_LOWER = Object.freeze({
  city: 'city',
  local: 'local',
  county: 'county',
})

const L2_DISTRICT_TYPES = Object.freeze({
  US_CONGRESSIONAL_DISTRICT: 'US_Congressional_District',
  STATE_SENATE_DISTRICT: 'State_Senate_District',
  STATE_HOUSE_DISTRICT: 'State_House_District',
  COUNTY: 'County',
  TOWNSHIP: 'Township',
  TOWN_DISTRICT: 'Town_District',
  TOWN_COUNCIL: 'Town_Council',
  HAMLET_COMMUNITY_AREA: 'Hamlet_Community_Area',
  VILLAGE: 'Village',
  BOROUGH: 'Borough',
  BOROUGH_WARD: 'Borough_Ward',
  CITY: 'City',
  CITY_COUNCIL_COMMISSIONER_DISTRICT: 'City_Council_Commissioner_District',
  CITY_WARD: 'City_Ward',
  COUNTY_SUPERVISORIAL_DISTRICT: 'County_Supervisorial_District',
  COUNTY_COMMISSIONER_DISTRICT: 'County_Commissioner_District',
  COUNTY_LEGISLATIVE_DISTRICT: 'County_Legislative_District',
  PRECINCT: 'Precinct',
  TOWN_WARD: 'Town_Ward',
  TOWNSHIP_WARD: 'Township_Ward',
  VILLAGE_WARD: 'Village_Ward',
})

const KEYWORDS = Object.freeze({
  PRESIDENT_OF_US: 'President of the United States',
  SENATE: 'Senate',
  SENATOR: 'Senator',
  HOUSE: 'House',
  ASSEMBLY: 'Assembly',
  REPRESENTATIVE: 'Representative',
  TOWNSHIP: 'Township',
  TWP: 'TWP',
  VILLAGE: 'Village',
  VLG: 'VLG',
  HAMLET: 'Hamlet',
  BOROUGH: 'Borough',
  COMMISSION: 'Commission',
  COUNCIL: 'Council',
  SUPERVISOR: 'Supervisor',
  COMMISSIONER: 'Commissioner',
  PRECINCT: 'Precinct',
})

const DISTRICT_WORDS = Object.freeze([
  'District',
  'Ward',
  'Precinct',
  'Subdistrict',
  'Division',
  'Circuit',
  'Position',
  'Seat',
  'Place',
  'Group',
  'Courthouse',
  'Court',
  'Department',
  'Area',
  'Office',
  'Post',
])

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const DISTRICT_WORDS_PATTERN = new RegExp(
  `\\b(${[...DISTRICT_WORDS]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex)
    .join('|')})\\s+([0-9]+)`,
  'i',
)

const AI_TOOL = Object.freeze({
  MATCH_COLUMNS: 'match_columns',
  MATCH_LABELS: 'matchLabels',
})

const AI_JSON = Object.freeze({
  COLUMNS: 'columns',
  MATCHED_LABEL: 'matchedLabel',
})

const OPENAI_ROLE = Object.freeze({
  SYSTEM: 'system',
  USER: 'user',
})

const MATCH_COLUMNS_SYSTEM_PROMPT =
  'You are a political assistant whose job is to find the top 5 columns that match the office name (ordered by the most likely at the top). If none of the labels are a good match then you will return an empty column array. Make sure you only return columns that are extremely relevant. For Example: for a City Council position you would not return a State position or a School District position. Please return valid JSON only. Do not return more than 5 columns.'

const CATEGORY_SEARCH_MAP: Record<OfficeCategory, string[]> = {
  [OfficeCategory.Judicial]: [
    'Judicial',
    'Judge',
    'Attorney',
    'Court',
    'Justice',
  ],
  [OfficeCategory.Education]: [
    'Education',
    'School',
    'College',
    'University',
    'Elementary',
  ],
  [OfficeCategory.City]: [
    'City Council',
    'City Mayor',
    'City Clerk',
    'City Treasurer',
    'City Commission',
  ],
  [OfficeCategory.County]: [
    'County Commission',
    'County Supervisor',
    'County Legislative',
    'County Board',
  ],
  [OfficeCategory.State]: [
    'U.S. Congress',
    'U.S. Senate',
    'U.S. House',
    'U.S. Representative',
    'U.S. Senator',
    'Senate',
    'State House',
    'House of Representatives',
    'State Assembly',
    'State Representative',
    'State Senator',
  ],
}

// -------------------------
// Schemas
// -------------------------

const MatchColumnsResponseSchema = z.object({
  [AI_JSON.COLUMNS]: z.array(z.string()).max(5),
})

const MatchLabelResponseSchema = z.object({
  [AI_JSON.MATCHED_LABEL]: z.string(),
})

@Injectable()
export class OfficeMatchService {
  private readonly logger = new Logger(OfficeMatchService.name)

  constructor(
    private prisma: PrismaService,
    private slack: SlackService,
    private aiService: AiService,
    private elections: ElectionsService,
  ) {}

  async searchDistrictTypes(
    slug: string,
    officeName: string,
    electionLevel: ElectionLevel,
    electionState: string,
    subAreaName?: string,
    subAreaValue?: string,
  ): Promise<string[]> {
    // 1) Pull valid district types from Elections API (state/year aware)
    const districtTypes = await this.getValidDistrictTypes(slug, electionState)
    if (districtTypes.length === 0) return []

    // 2) Build candidate list using ONLY API-provided types, ordered by heuristics
    const orderedCandidates = await this.buildOrderedCandidateColumns(
      slug,
      officeName,
      electionLevel,
      districtTypes,
      subAreaName,
      subAreaValue,
    )

    // 3) Use AI to select the top 1-5 best matching district type columns
    const foundDistrictTypes = await this.selectBestDistrictTypesWithAi(
      slug,
      Array.from(orderedCandidates),
      officeName,
      districtTypes,
    )

    this.logger.debug(
      `searchDistrictTypes: returning ${foundDistrictTypes.length} matched district types: ${JSON.stringify(foundDistrictTypes)}`,
    )
    return foundDistrictTypes
  }

  // Step 1 helper: Pull valid district types from Elections API (state/year aware)
  private async getValidDistrictTypes(
    slug: string,
    electionState: string,
  ): Promise<string[]> {
    let districtTypes: string[] = []
    const campaign = await this.prisma.campaign.findUnique({
      where: { slug },
      select: { details: true },
    })
    const details = campaign?.details as { electionDate?: string } | undefined
    const electionYear = details?.electionDate
      ? getYear(details?.electionDate)
      : undefined
    if (!electionYear) {
      await this.slack.message(
        {
          body: `Error! ${slug} Campaign must have an electionDate to be given an L2 district`,
        },
        SlackChannel.botPathToVictoryIssues,
      )
      return []
    }
    try {
      const apiRes = await this.elections.getValidDistrictTypes(
        electionState,
        electionYear,
      )
      districtTypes =
        (apiRes ?? []).map((r) => r.L2DistrictType).filter(Boolean) || []
    } catch (e) {
      const msg = `Election API error fetching district types: ${e instanceof Error ? e.message : String(e)}`
      this.logger.error(msg)
    }

    districtTypes = districtTypes.filter((t) => t && t !== '')
    this.logger.debug(
      `searchDistrictTypes: received ${districtTypes.length} API district types for state=${electionState}`,
    )

    if (districtTypes.length === 0) {
      await this.slack.message(
        {
          body: `Error! ${slug} No district types returned by Election API for state ${electionState}.`,
        },
        SlackChannel.botPathToVictoryIssues,
      )
      return []
    }

    return districtTypes
  }

  // Step 2 helper: Build candidate list using ONLY API-provided types, ordered by heuristics
  private async buildOrderedCandidateColumns(
    slug: string,
    officeName: string,
    electionLevel: ElectionLevel,
    districtTypes: string[],
    subAreaName?: string,
    subAreaValue?: string,
  ): Promise<Set<string>> {
    const category = this.getOfficeCategory(officeName, electionLevel)
    this.logger.debug(
      `searchDistrictTypes: inferred category=${category} for office="${officeName}" level=${electionLevel}`,
    )

    const base = await this.determineSearchColumns(
      slug,
      electionLevel,
      officeName,
    )
    const heuristicLevelTypes = base.filter((t) => districtTypes.includes(t))
    this.logger.debug(
      `searchDistrictTypes: heuristicLevelTypes=${JSON.stringify(heuristicLevelTypes)}`,
    )

    let subColumns: string[] = []
    const districtValue = this.getDistrictValue(
      slug,
      officeName,
      subAreaName,
      subAreaValue,
    )
    if (
      electionLevel !== ElectionLevel.federal &&
      electionLevel !== ElectionLevel.state &&
      heuristicLevelTypes.length > 0 &&
      districtValue
    ) {
      const subs = this.determineElectionDistricts(
        slug,
        heuristicLevelTypes,
        officeName,
      )
      subColumns = subs.filter((t) => districtTypes.includes(t))
    }
    this.logger.debug(
      `searchDistrictTypes: subColumns=${JSON.stringify(subColumns)} (districtValue=${districtValue})`,
    )

    let categoryTypes: string[] = districtTypes
    if (category) {
      const cat = category.toLowerCase()
      const filtered = districtTypes.filter((t) =>
        String(t).toLowerCase().includes(cat),
      )
      if (filtered.length > 0) {
        categoryTypes = filtered
      }
    }
    this.logger.debug(
      `searchDistrictTypes: categoryTypes (post-filter) size=${categoryTypes.length}`,
    )

    const orderedCandidates = new Set<string>()
    const pushInOrder = (arr: string[]) => {
      for (const t of arr) {
        orderedCandidates.add(t)
      }
    }
    pushInOrder(subColumns)
    pushInOrder(heuristicLevelTypes)
    pushInOrder(categoryTypes)
    pushInOrder(districtTypes)
    this.logger.debug(
      `searchDistrictTypes: orderedCandidates size=${orderedCandidates.size}`,
    )
    return orderedCandidates
  }

  // Step 3 helper: Use AI to select the top 1-5 best matching district type columns
  private async selectBestDistrictTypesWithAi(
    slug: string,
    orderedCandidates: string[],
    officeName: string,
    districtTypes: string[],
  ): Promise<string[]> {
    const matchResp = await this.matchSearchColumns(
      orderedCandidates,
      officeName,
    )

    let foundDistrictTypes: string[] = []
    if (matchResp?.content) {
      const parsedResult = parseJsonString(
        MatchColumnsResponseSchema,
        'Invalid match columns JSON',
      ).safeParse(matchResp.content)
      if (parsedResult.success) {
        const strings = parsedResult.data[AI_JSON.COLUMNS]
        if (strings.length > 0) {
          foundDistrictTypes = strings.filter((c) => districtTypes.includes(c))
        } else {
          await this.slack.message(
            {
              body: `Received invalid response while finding district types for ${officeName}. columns: ${JSON.stringify(strings)}. Raw Content: ${matchResp.content}`,
            },
            SlackChannel.botDev,
          )
        }
      } else {
        await this.slack.message(
          {
            body: `Received invalid response while finding district types for ${officeName}. Raw Content: ${matchResp.content}`,
          },
          SlackChannel.botDev,
        )
      }
    } else {
      this.logger.debug(
        `searchDistrictTypes: AI matching returned no content for office="${officeName}"`,
      )
    }
    return foundDistrictTypes
  }
  private getOfficeCategory(
    officeName: string,
    electionLevel: string,
  ): string | undefined {
    let category: string | undefined

    for (const [key, value] of Object.entries(CATEGORY_SEARCH_MAP)) {
      for (const search of value) {
        if (officeName.toLowerCase().includes(search.toLowerCase())) {
          category = key
          break
        }
      }
      if (category) break
    }

    if (!category) {
      const lowerElectionLevel = electionLevel.toLowerCase()
      if (
        lowerElectionLevel === ELECTION_LEVEL_LOWER.city ||
        lowerElectionLevel === ELECTION_LEVEL_LOWER.local
      ) {
        category = OfficeCategory.City
      } else if (lowerElectionLevel === ELECTION_LEVEL_LOWER.county) {
        category = OfficeCategory.County
      }
    }

    return category
  }

  private async matchSearchColumns(
    searchColumns: string[],
    searchString: string,
  ) {
    this.logger.debug(
      `Doing AI search for ${searchString} against ${searchColumns.length} columns`,
    )

    const matchColumnTool: ChatCompletionTool = {
      type: 'function',
      function: {
        name: AI_TOOL.MATCH_COLUMNS,
        description: 'Determine the columns that best match the office name.',
        parameters: {
          type: 'object',
          properties: {
            [AI_JSON.COLUMNS]: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                'The list of columns that best match the office name.',
              maxItems: 5,
            },
          },
          required: [AI_JSON.COLUMNS],
        },
      },
    }

    const toolChoice: ChatCompletionNamedToolChoice = {
      type: 'function',
      function: { name: AI_TOOL.MATCH_COLUMNS },
    }

    return await this.aiService.getChatToolCompletion({
      messages: [
        {
          role: OPENAI_ROLE.SYSTEM as AiChatMessage['role'],
          content: MATCH_COLUMNS_SYSTEM_PROMPT,
        },
        {
          role: OPENAI_ROLE.USER as AiChatMessage['role'],
          content: `Find the top 5 columns that matches the following office: "${searchString}.\n\nColumns: ${searchColumns}"`,
        },
      ],
      temperature: 0.1,
      topP: 0.1,
      tool: matchColumnTool,
      toolChoice: toolChoice,
    })
  }

  async searchLocationDistricts(
    slug: string,
    electionLevel: string,
    officeName: string,
    subAreaName?: string,
    subAreaValue?: string,
  ): Promise<string[]> {
    let searchColumns: string[] = []
    try {
      searchColumns = await this.determineSearchColumns(
        slug,
        electionLevel,
        officeName,
      )
    } catch (error) {
      const msg = `Error determining search columns: ${error instanceof Error ? error.message : String(error)}`
      this.logger.error(msg)
    }

    const districtValue = this.getDistrictValue(
      slug,
      officeName,
      subAreaName,
      subAreaValue,
    )

    let subColumns: string[] = []
    if (
      electionLevel !== ElectionLevel.federal &&
      electionLevel !== ElectionLevel.state &&
      searchColumns.length > 0 &&
      districtValue
    ) {
      subColumns = this.determineElectionDistricts(
        slug,
        searchColumns,
        officeName,
      )
    }

    if (subColumns.length > 0) {
      // if we have subColumns, we want to prioritize them at the top.
      // since they are more specific.
      this.logger.debug('adding to searchColumns', subColumns)
      searchColumns = subColumns.concat(searchColumns)
    }

    return searchColumns
  }

  private determineElectionDistricts(
    slug: string,
    searchColumns: string[],
    officeName: string,
  ): string[] {
    const subColumns: string[] = []

    // This district map is used to determine which sub columns to search for.
    // it was provided by L2.
    const districtMap: Record<string, string[]> = {
      [L2_DISTRICT_TYPES.BOROUGH]: [L2_DISTRICT_TYPES.BOROUGH_WARD],
      [L2_DISTRICT_TYPES.CITY]:
        officeName.includes(KEYWORDS.COMMISSION) ||
        officeName.includes(KEYWORDS.COUNCIL)
          ? [
              L2_DISTRICT_TYPES.CITY_COUNCIL_COMMISSIONER_DISTRICT,
              L2_DISTRICT_TYPES.CITY_WARD,
            ]
          : [L2_DISTRICT_TYPES.CITY_WARD],
      [L2_DISTRICT_TYPES.COUNTY]: officeName.includes(KEYWORDS.SUPERVISOR)
        ? [L2_DISTRICT_TYPES.COUNTY_SUPERVISORIAL_DISTRICT]
        : officeName.includes(KEYWORDS.COMMISSIONER)
          ? [
              L2_DISTRICT_TYPES.COUNTY_COMMISSIONER_DISTRICT,
              L2_DISTRICT_TYPES.COUNTY_LEGISLATIVE_DISTRICT,
            ]
          : officeName.includes(KEYWORDS.PRECINCT)
            ? [L2_DISTRICT_TYPES.PRECINCT]
            : [L2_DISTRICT_TYPES.COUNTY_COMMISSIONER_DISTRICT],
      [L2_DISTRICT_TYPES.TOWN_DISTRICT]: [L2_DISTRICT_TYPES.TOWN_WARD],
      [L2_DISTRICT_TYPES.TOWNSHIP]: [L2_DISTRICT_TYPES.TOWNSHIP_WARD],
      [L2_DISTRICT_TYPES.VILLAGE]: [L2_DISTRICT_TYPES.VILLAGE_WARD],
    }

    for (const column of searchColumns) {
      this.logger.debug('searching for sub columns', column)
      if (districtMap[column]) {
        this.logger.debug('adding to searchColumns', districtMap[column])
        subColumns.push(...districtMap[column])
      }
    }
    this.logger.debug('electionDistricts', subColumns)
    return subColumns
  }

  private async determineSearchColumns(
    slug: string,
    electionLevel: string,
    officeName: string,
  ): Promise<string[]> {
    this.logger.debug(
      `determining Search Columns for ${officeName}. level: ${electionLevel}`,
    )
    let searchColumns: string[] = []

    if (electionLevel === ElectionLevel.federal) {
      if (officeName.includes(KEYWORDS.PRESIDENT_OF_US)) {
        searchColumns = ['']
      } else {
        searchColumns = [L2_DISTRICT_TYPES.US_CONGRESSIONAL_DISTRICT]
      }
    } else if (electionLevel === ElectionLevel.state) {
      if (
        officeName.includes(KEYWORDS.SENATE) ||
        officeName.includes(KEYWORDS.SENATOR)
      ) {
        searchColumns = [L2_DISTRICT_TYPES.STATE_SENATE_DISTRICT]
      } else if (
        officeName.includes(KEYWORDS.HOUSE) ||
        officeName.includes(KEYWORDS.ASSEMBLY) ||
        officeName.includes(KEYWORDS.REPRESENTATIVE)
      ) {
        searchColumns = [L2_DISTRICT_TYPES.STATE_HOUSE_DISTRICT]
      }
    } else if (electionLevel === ElectionLevel.county) {
      searchColumns = [L2_DISTRICT_TYPES.COUNTY]
    } else if (
      electionLevel === ElectionLevel.city ||
      String(electionLevel).toLowerCase() === ELECTION_LEVEL_LOWER.local
    ) {
      if (
        officeName.includes(KEYWORDS.TOWNSHIP) ||
        officeName.includes(KEYWORDS.TWP)
      ) {
        searchColumns = [
          L2_DISTRICT_TYPES.TOWNSHIP,
          L2_DISTRICT_TYPES.TOWN_DISTRICT,
          L2_DISTRICT_TYPES.TOWN_COUNCIL,
        ]
      } else if (
        officeName.includes(KEYWORDS.VILLAGE) ||
        officeName.includes(KEYWORDS.VLG)
      ) {
        searchColumns = [
          L2_DISTRICT_TYPES.VILLAGE,
          L2_DISTRICT_TYPES.CITY,
          L2_DISTRICT_TYPES.TOWN_DISTRICT,
        ]
      } else if (officeName.includes(KEYWORDS.HAMLET)) {
        searchColumns = [
          L2_DISTRICT_TYPES.HAMLET_COMMUNITY_AREA,
          L2_DISTRICT_TYPES.CITY,
          L2_DISTRICT_TYPES.TOWN_DISTRICT,
        ]
      } else if (officeName.includes(KEYWORDS.BOROUGH)) {
        searchColumns = [
          L2_DISTRICT_TYPES.BOROUGH,
          L2_DISTRICT_TYPES.CITY,
          L2_DISTRICT_TYPES.TOWN_DISTRICT,
        ]
      } else {
        searchColumns = [
          L2_DISTRICT_TYPES.CITY,
          L2_DISTRICT_TYPES.TOWN_DISTRICT,
          L2_DISTRICT_TYPES.TOWN_COUNCIL,
          L2_DISTRICT_TYPES.HAMLET_COMMUNITY_AREA,
          L2_DISTRICT_TYPES.VILLAGE,
          L2_DISTRICT_TYPES.BOROUGH,
          L2_DISTRICT_TYPES.TOWNSHIP,
        ]
      }
    } else {
      await this.slack.message(
        {
          body: `Error! ${slug} Invalid electionLevel ${electionLevel}`,
        },
        SlackChannel.botPathToVictoryIssues,
      )
    }
    return searchColumns
  }

  private getDistrictValue(
    slug: string,
    officeName: string,
    subAreaName?: string,
    subAreaValue?: string,
  ): string | undefined {
    this.logger.debug(
      `getting DistrictValue: ${officeName}. subAreaName: ${subAreaName}. subAreaValue: ${subAreaValue}`,
    )

    let districtValue: string | undefined
    if (subAreaName || subAreaValue) {
      const subAreaIsNumeric =
        subAreaValue !== undefined &&
        subAreaValue !== null &&
        String(subAreaValue).trim() !== '' &&
        !isNaN(Number(subAreaValue))

      if (!subAreaIsNumeric) {
        // subAreaValue is missing or not numeric, try to parse number from officeName
        const match = officeName.match(DISTRICT_WORDS_PATTERN)
        if (match) {
          districtValue = match[2]
        }
        // If still not found, use subAreaValue as a fallback (might be a named area like a county)
        if (!districtValue && subAreaValue) {
          districtValue = subAreaValue
        }
      } else {
        // subAreaValue is numeric; use it directly
        districtValue = subAreaValue
      }
    }

    if (districtValue) {
      districtValue = districtValue.trim()
    }

    return districtValue
  }

  async getSearchColumn(
    slug: string,
    searchColumn: string,
    electionState: string,
    searchString: string,
    searchString2: string = '',
    electionDate: string,
  ): Promise<SearchColumnResult | undefined> {
    let foundColumn: SearchColumnResult | undefined
    try {
      const search = searchString2
        ? `${searchString} ${searchString2}`
        : searchString

      this.logger.debug(`searching for ${search}`)

      const electionYear = getYear(electionDate)
      if (!electionYear) {
        await this.slack.message(
          {
            body: `Error! ${slug} Campaign must have an electionDate to be given an L2 district`,
          },
          SlackChannel.botPathToVictoryIssues,
        )
        return
      }
      const apiRes = await this.elections.getValidDistrictNames(
        searchColumn,
        electionState,
        electionYear,
      )
      const searchValues: string[] =
        (apiRes ?? [])
          .map((r) => r.L2DistrictName)
          .filter((value) => value !== '') || []

      // strip out any searchValues that are blank strings

      this.logger.debug(
        `found ${searchValues.length} searchValues for ${searchColumn}`,
      )

      if (searchValues.length > 0) {
        this.logger.debug(`Using AI to find the best match ...`)
        const match = await this.matchSearchValues(
          slug,
          searchValues.join('\n'),
          search,
        )
        this.logger.debug('match', match)

        if (
          match &&
          match !== '' &&
          match !== `${electionState}##` &&
          match !== `${electionState}####`
        ) {
          foundColumn = {
            column: searchColumn,
            value: match.replaceAll('"', ''),
          }
        }
      }

      this.logger.debug('getSearchColumn foundColumn', foundColumn)
    } catch (error) {
      const msg = `Error in getSearchColumn: ${error instanceof Error ? error.message : String(error)}`
      this.logger.error(msg)
      return undefined
    }

    return foundColumn
  }

  private async matchSearchValues(
    slug: string,
    searchValues: string,
    searchString: string,
  ): Promise<string | undefined> {
    const matchLabelsTool: ChatCompletionTool = {
      type: 'function',
      function: {
        name: AI_TOOL.MATCH_LABELS,
        description: 'Determine the label that closely matches the input.',
        parameters: {
          type: 'object',
          properties: {
            [AI_JSON.MATCHED_LABEL]: {
              type: 'string',
              description: 'The label that closely matches the input.',
            },
          },
          required: [AI_JSON.MATCHED_LABEL],
        },
      },
    }

    const toolChoice: ChatCompletionNamedToolChoice = {
      type: 'function',
      function: { name: AI_TOOL.MATCH_LABELS },
    }

    const messages = [
      {
        role: 'system',
        content: `
        You are a helpful political assistant whose job is to find the label that closely matches the input. You will return only the matching label in your response and nothing else. You will return in the JSON format specified. If none of the labels are a good match then you will return an empty string for the matchedLabel. If there is a good match return the entire label in the matchedLabel including any hashtags. 
        Example Input: 'Los Angeles School Board District 15 - Los Angeles - CA'
        Example Labels: 'CERRITOS COMM COLL DIST'\n 'GLENDALE COMM COLL DIST'\n 'LOS ANGELES COMM COLL DIST'
        Example Output:
        {
          matchedLabel: ''
        }
        Example Input: 'San Clemente City Council District 1 - San Clemente- CA'
        Example Labels: 'ALHAMBRA CITY CNCL 1'\n 'BELLFLOWER CITY CNCL 1'\n 'SAN CLEMENTE CITY CNCL 1'\n
        Example Output:
        {
          matchedLabel: 'SAN CLEMENTE CITY CNCL 1'
        }
        Example Input: 'California State Senate District 5 - CA'
        Example Labels: '04'\n '05'\n '06'\n
        Example Output: {
          matchedLabel: '05'
        }
        Example Input: 'Maine Village Board Chair - Wisconsin'
        Example Labels: 'MARATHON COMM COLL DIST'\n 'MARINETTE COMM COLL DIST'\n 'MARQUETTE COMM COLL DIST'\n
        Example Output:
        {
             'matchedLabel': '',
        }
        `,
      },
      {
        role: 'user',
        content: `Find the label that matches. Input: ${searchString}.\n\nLabels: ${searchValues}. Output:`,
      },
    ]

    const completion = await this.aiService.getChatToolCompletion({
      messages: messages as AiChatMessage[],
      temperature: 0.1,
      topP: 0.1,
      tool: matchLabelsTool,
      toolChoice,
    })

    const content = completion?.content
    const tokens = completion?.tokens

    this.logger.debug('content', content)
    this.logger.debug('tokens', tokens)

    if (!tokens || tokens === 0) {
      await this.slack.message(
        {
          body: `Error! ${slug} AI failed to find a match for ${searchString}.`,
        },
        SlackChannel.botPathToVictoryIssues,
      )
      this.logger.error(`No Response from AI! For ${String(searchValues)}`)
    }

    if (content && content !== '') {
      const parsedResult = parseJsonString(
        MatchLabelResponseSchema,
        'Invalid matched label JSON',
      ).safeParse(content)
      if (parsedResult.success) {
        const matched = parsedResult.data.matchedLabel
        if (matched !== '') {
          return matched.replace(/"/g, '')
        }
      }
    }
    return undefined
  }
}
