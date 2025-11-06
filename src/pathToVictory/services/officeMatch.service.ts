import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { SlackService } from '../../vendors/slack/services/slack.service'
import { SlackChannel } from '../../vendors/slack/slackService.types'
import { AiService } from '../../ai/ai.service'
import { ElectionType } from '@prisma/client'
import {
  ChatCompletionNamedToolChoice,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import { VotersService } from '../../voters/services/voters.service'
import { AiChatMessage } from 'src/campaigns/ai/chat/aiChat.types'

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
    private votersService: VotersService,
  ) {}

  async searchMiscDistricts(
    slug: string,
    officeName: string,
    electionLevel: string,
    electionState: string,
  ): Promise<string[]> {
    let searchColumns: string[] = []
    try {
      this.logger.debug(`Searching misc districts for ${officeName}`)
      searchColumns = await this.findMiscDistricts(
        slug,
        officeName,
        electionState,
        electionLevel,
      )

      this.logger.debug('miscDistricts', { searchColumns })
      return searchColumns
    } catch (error) {
      this.logger.error('error', error)
    }
    return searchColumns
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

  private async findMiscDistricts(
    slug: string,
    officeName: string,
    state: string,
    electionLevel: string,
  ): Promise<string[]> {
    const category = this.getOfficeCategory(officeName, electionLevel)
    this.logger.debug(
      `Determined category: ${category} for office ${officeName}`,
    )

    let results: ElectionType[] = []
    if (category) {
      results = await this.prisma.electionType.findMany({
        where: {
          state: state,
          category: category,
        },
      })
    }

    if (results.length === 0) {
      results = await this.prisma.electionType.findMany({
        where: {
          state: state,
        },
      })
    }

    if (results.length === 0) {
      this.logger.error(
        `No ElectionType results found for state ${state}. You may need to run seed election-types.`,
      )
      await this.slack.message(
        {
          body: `Error! ${slug} No ElectionType results found for state ${state}. You may need to run seed election-types.`,
        },
        SlackChannel.botPathToVictoryIssues,
      )
      return []
    }

    const miscellaneousDistricts = results
      .filter((result) => result.name && result.category)
      .map((result) => result.name)

    const matchResp = await this.matchSearchColumns(
      slug,
      miscellaneousDistricts,
      officeName,
    )

    let foundMiscDistricts: string[] = []
    if (matchResp?.content) {
      try {
        const contentJson = JSON.parse(matchResp.content)
        const columns = contentJson?.columns || []

        if (Array.isArray(columns) && columns.length > 0) {
          foundMiscDistricts = columns
        } else {
          await this.slack.message(
            {
              body: `Received invalid response while finding misc districts for ${officeName}. columns: ${columns}. typeof columns: ${typeof columns}. Raw Content: ${matchResp.content}`,
            },
            SlackChannel.botDev,
          )
        }
      } catch (e) {
        this.logger.error('Error parsing matchResp', e)
      }
    }

    return foundMiscDistricts
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
      this.logger.error('error', error)
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
      this.logger.debug('adding to searchColumns', { subColumns })
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
      this.logger.debug('searching for sub columns', { column })
      if (districtMap[column]) {
        this.logger.debug('adding to searchColumns', {
          column: districtMap[column],
        })
        subColumns.push(...districtMap[column])
      }
    }
    this.logger.debug('electionDistricts', { subColumns })
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
      if (!subAreaValue && !isNaN(Number(subAreaValue))) {
        for (const word of districtWords) {
          if (officeName.includes(word)) {
            const regex = new RegExp(`${word} ([0-9]+)`)
            const match = officeName.match(regex)
            if (match) {
              districtValue = match[1]
            } else {
              // could not find a district number in officeName, it's probably a word like a county.
              districtValue = subAreaValue
            }
          }
        }
      } else {
        // subAreaValue is a number lets use that.
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
  ): Promise<SearchColumnResult | undefined> {
    let foundColumn: SearchColumnResult | undefined
    try {
      const search = searchString2
        ? `${searchString} ${searchString2}`
        : searchString

      this.logger.debug(`searching for ${search}`)

      let searchValues = await this.votersService.querySearchColumn(
        searchColumn,
        electionState,
      )

      // strip out any searchValues that are blank strings
      searchValues = searchValues.filter((value) => value !== '')

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
        this.logger.debug('match', { match })

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

      this.logger.debug('getSearchColumn foundColumn', { foundColumn })
    } catch (error) {
      this.logger.error('Error in getSearchColumn', error)
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
        Example Labels: 'CA####ALHAMBRA CITY CNCL 1'\n 'CA####BELLFLOWER CITY CNCL 1'\n 'CA####SAN CLEMENTE CITY CNCL 1'\n
        Example Output:
        {
          matchedLabel: 'CA####SAN CLEMENTE CITY CNCL 1'
        }
        Example Input: 'California State Senate District 5 - CA'
        Example Labels: 'CA##04'\n 'CA##05'\n 'CA##06'\n
        Example Output: {
          matchedLabel: 'CA##05'
        }
        Example Input: 'Maine Village Board Chair - Wisconsin'
        Example Labels: 'WI##MARATHON COMM COLL DIST'\n 'WI##MARINETTE COMM COLL DIST'\n 'WI##MARQUETTE COMM COLL DIST'\n
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

    this.logger.debug('content', { content })
    this.logger.debug('tokens', { tokens })

    if (!tokens || tokens === 0) {
      await this.slack.message(
        {
          body: `Error! ${slug} AI failed to find a match for ${searchString}.`,
        },
        SlackChannel.botPathToVictoryIssues,
      )
      this.logger.error('No Response from AI! For', { searchValues })
    }

    if (content && content !== '') {
      try {
        const data = JSON.parse(content)
        if (data?.matchedLabel && data.matchedLabel !== '') {
          return data.matchedLabel.replace(/"/g, '')
        }
      } catch (error) {
        this.logger.error('error parsing AI response', error)
      }
    }
    return undefined
  }
}
