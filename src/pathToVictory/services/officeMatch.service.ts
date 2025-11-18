import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common'
import {
  ChatCompletionNamedToolChoice,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { AiChatMessage } from 'src/campaigns/ai/chat/aiChat.types'
import { ElectionsService } from 'src/elections/services/elections.service'
import { AiService } from '../../ai/ai.service'
import { PrismaService } from '../../prisma/prisma.service'
import { SlackService } from '../../vendors/slack/services/slack.service'
import { SlackChannel } from '../../vendors/slack/slackService.types'

interface SearchColumnResult {
  column: string
  value: string
}

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
    electionLevel: string,
    electionState: string,
    subAreaName?: string,
    subAreaValue?: string,
  ): Promise<string[]> {
    // 1) Pull valid district types from Elections API (state/year aware)
    let districtTypes: string[] = []
    try {
      const campaign = await this.prisma.campaign.findUnique({
        where: { slug },
        select: { details: true },
      })
      const details = campaign?.details as { electionDate?: string } | undefined
      const electionYear =
        details?.electionDate && String(details.electionDate).length >= 4
          ? Number(String(details.electionDate).slice(0, 4))
          : undefined
      const apiRes =
        electionYear !== undefined
          ? await this.elections.getValidDistrictTypes(
              electionState,
              electionYear,
            )
          : await this.elections.getValidDistrictTypes(
              electionState,
              0 as unknown as number,
              false,
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

    const typesSet = new Set(districtTypes)

    // 2) Build candidate list using ONLY API-provided types, ordered by heuristics
    const category = this.getOfficeCategory(officeName, electionLevel)
    this.logger.debug(
      `searchDistrictTypes: inferred category=${category} for office="${officeName}" level=${electionLevel}`,
    )

    // 2a) Heuristic base types based on electionLevel/officeName (filtered to API types)
    let heuristicLevelTypes: string[] = []
    try {
      const base = await this.determineSearchColumns(
        slug,
        electionLevel,
        officeName,
      )
      heuristicLevelTypes = base.filter((t) => typesSet.has(t))
    } catch (e) {
      const msg = `Error determining heuristic level types: ${e instanceof Error ? e.message : String(e)}`
      this.logger.error(msg)
    }
    this.logger.debug(
      `searchDistrictTypes: heuristicLevelTypes=${JSON.stringify(heuristicLevelTypes)}`,
    )

    // 2b) Sub-district types if we likely have a numeric district (filtered to API types)
    let subColumns: string[] = []
    const districtValue = this.getDistrictValue(
      slug,
      officeName,
      subAreaName,
      subAreaValue,
    )
    if (
      electionLevel !== 'federal' &&
      electionLevel !== 'state' &&
      heuristicLevelTypes.length > 0 &&
      districtValue
    ) {
      const subs = this.determineElectionDistricts(
        slug,
        heuristicLevelTypes,
        officeName,
      )
      subColumns = subs.filter((t) => typesSet.has(t))
    }
    this.logger.debug(
      `searchDistrictTypes: subColumns=${JSON.stringify(subColumns)} (districtValue=${districtValue})`,
    )

    // 2c) Category-filtered types (e.g., City/County/State/Judicial/Education)
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

    // 2d) Combine candidates in priority order: subColumns → heuristicLevelTypes → categoryTypes → remaining
    const orderedCandidates: string[] = []
    const pushUnique = (arr: string[]) => {
      for (const t of arr) {
        if (typesSet.has(t) && !orderedCandidates.includes(t)) {
          orderedCandidates.push(t)
        }
      }
    }
    pushUnique(subColumns)
    pushUnique(heuristicLevelTypes)
    pushUnique(categoryTypes)
    // add remaining API types not yet included
    pushUnique(districtTypes)
    this.logger.debug(
      `searchDistrictTypes: orderedCandidates size=${orderedCandidates.length}`,
    )

    // 3) Use AI to select the top 1-5 best matching district type columns
    const matchResp = await this.matchSearchColumns(
      slug,
      orderedCandidates,
      officeName,
    )

    let foundDistrictTypes: string[] = []
    if (matchResp?.content) {
      try {
        const parsed: unknown = JSON.parse(matchResp.content)
        if (
          parsed &&
          typeof parsed === 'object' &&
          'columns' in parsed &&
          Array.isArray((parsed as { columns?: unknown[] }).columns)
        ) {
          const cols = (parsed as { columns: unknown[] }).columns
          const strings = cols.filter((c) => typeof c === 'string') as string[]
          if (strings.length > 0) {
            // Ensure all returned columns exist in API-provided list
            foundDistrictTypes = strings.filter((c) => typesSet.has(c))
          } else {
            await this.slack.message(
              {
                body: `Received invalid response while finding district types for ${officeName}. columns: ${JSON.stringify(cols)}. Raw Content: ${matchResp.content}`,
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
      } catch (e) {
        const msg = `Error parsing AI match response: ${e instanceof Error ? e.message : String(e)}`
        this.logger.error(msg)
      }
    } else {
      this.logger.debug(
        `searchDistrictTypes: AI matching returned no content for office="${officeName}"`,
      )
    }

    this.logger.debug(
      `searchDistrictTypes: returning ${foundDistrictTypes.length} matched district types: ${JSON.stringify(foundDistrictTypes)}`,
    )
    return foundDistrictTypes
  }

  private getOfficeCategory(
    officeName: string,
    electionLevel: string,
  ): string | undefined {
    const searchMap = {
      Judicial: ['Judicial', 'Judge', 'Attorney', 'Court', 'Justice'],
      Education: ['Education', 'School', 'College', 'University', 'Elementary'],
      City: [
        'City Council',
        'City Mayor',
        'City Clerk',
        'City Treasurer',
        'City Commission',
      ],
      County: [
        'County Commission',
        'County Supervisor',
        'County Legislative',
        'County Board',
      ],
      State: [
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

    let category: string | undefined

    for (const [key, value] of Object.entries(searchMap)) {
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
      if (lowerElectionLevel === 'city' || lowerElectionLevel === 'local') {
        category = 'City'
      } else if (lowerElectionLevel === 'county') {
        category = 'County'
      }
    }

    return category
  }

  private async matchSearchColumns(
    slug: string,
    searchColumns: string[],
    searchString: string,
  ) {
    this.logger.debug(
      `Doing AI search for ${searchString} against ${searchColumns.length} columns`,
    )

    const matchColumnTool: ChatCompletionTool = {
      type: 'function',
      function: {
        name: 'match_columns',
        description: 'Determine the columns that best match the office name.',
        parameters: {
          type: 'object',
          properties: {
            columns: {
              type: 'array',
              items: {
                type: 'string',
              },
              description:
                'The list of columns that best match the office name.',
              maxItems: 5,
            },
          },
          required: ['columns'],
        },
      },
    }

    const toolChoice: ChatCompletionNamedToolChoice = {
      type: 'function',
      function: { name: 'match_columns' },
    }

    return await this.aiService.getChatToolCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You are a political assistant whose job is to find the top 5 columns that match the office name (ordered by the most likely at the top). If none of the labels are a good match then you will return an empty column array. Make sure you only return columns that are extremely relevant. For Example: for a City Council position you would not return a State position or a School District position. Please return valid JSON only. Do not return more than 5 columns.',
        },
        {
          role: 'user',
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
      electionLevel !== 'federal' &&
      electionLevel !== 'state' &&
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
      Borough: ['Borough_Ward'],
      City:
        officeName.includes('Commission') || officeName.includes('Council')
          ? ['City_Council_Commissioner_District', 'City_Ward']
          : ['City_Ward'],
      County: officeName.includes('Supervisor')
        ? ['County_Supervisorial_District']
        : officeName.includes('Commissioner')
          ? ['County_Commissioner_District', 'County_Legislative_District']
          : officeName.includes('Precinct')
            ? ['Precinct']
            : ['County_Commissioner_District'],
      Town_District: ['Town_Ward'],
      Township: ['Township_Ward'],
      Village: ['Village_Ward'],
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

    if (electionLevel === 'federal') {
      if (officeName.includes('President of the United States')) {
        searchColumns = ['']
      } else {
        searchColumns = ['US_Congressional_District']
      }
    } else if (electionLevel === 'state') {
      if (officeName.includes('Senate') || officeName.includes('Senator')) {
        searchColumns = ['State_Senate_District']
      } else if (
        officeName.includes('House') ||
        officeName.includes('Assembly') ||
        officeName.includes('Representative')
      ) {
        searchColumns = ['State_House_District']
      }
    } else if (electionLevel === 'county') {
      searchColumns = ['County']
    } else if (electionLevel === 'city' || electionLevel === 'local') {
      if (officeName.includes('Township') || officeName.includes('TWP')) {
        searchColumns = ['Township', 'Town_District', 'Town_Council']
      } else if (officeName.includes('Village') || officeName.includes('VLG')) {
        searchColumns = ['Village', 'City', 'Town_District']
      } else if (officeName.includes('Hamlet')) {
        searchColumns = ['Hamlet_Community_Area', 'City', 'Town_District']
      } else if (officeName.includes('Borough')) {
        searchColumns = ['Borough', 'City', 'Town_District']
      } else {
        searchColumns = [
          'City',
          'Town_District',
          'Town_Council',
          'Hamlet_Community_Area',
          'Village',
          'Borough',
          'Township',
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
    const districtWords = [
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
      'Court',
      'Courthouse',
      'Department',
      'Area',
      'Office',
      'Post',
    ]

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
        for (const word of districtWords) {
          if (officeName.includes(word)) {
            const regex = new RegExp(`${word}\\s+([0-9]+)`, 'i')
            const match = officeName.match(regex)
            if (match) {
              districtValue = match[1]
              break
            }
          }
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

      const year =
        electionDate && electionDate.length >= 4
          ? Number(electionDate.slice(0, 4))
          : undefined
      if (!year) {
        throw new InternalServerErrorException(
          `Could not determine year from electionDate: ${electionDate}`,
        )
      }
      const apiRes = await this.elections.getValidDistrictNames(
        searchColumn,
        electionState,
        year,
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
        name: 'matchLabels',
        description: 'Determine the label that closely matches the input.',
        parameters: {
          type: 'object',
          properties: {
            matchedLabel: {
              type: 'string',
              description: 'The label that closely matches the input.',
            },
          },
          required: ['matchedLabel'],
        },
      },
    }

    const toolChoice: ChatCompletionNamedToolChoice = {
      type: 'function',
      function: { name: 'matchLabels' },
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
      try {
        const parsed: unknown = JSON.parse(content)
        if (
          parsed &&
          typeof parsed === 'object' &&
          'matchedLabel' in parsed &&
          typeof (parsed as { matchedLabel?: string }).matchedLabel === 'string'
        ) {
          const matched = (parsed as { matchedLabel: string }).matchedLabel
          if (matched !== '') {
            return matched.replace(/"/g, '')
          }
        }
      } catch (error) {
        const msg = `error parsing AI response: ${error instanceof Error ? error.message : String(error)}`
        this.logger.error(msg)
      }
    }
    return undefined
  }
}
