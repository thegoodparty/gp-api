import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { SlackService } from '../../vendors/slack/services/slack.service'
import { Campaign } from '@prisma/client'
import { ViabilityScore } from '../types/pathToVictory.types'
import { BallotReadyService } from 'src/elections/services/ballotReady.service'
import { RaceWithOfficeHoldersNode } from 'src/elections/types/ballotReady.types'
import { SHORT_TO_LONG_STATE } from '../../shared/constants/states'

@Injectable()
export class ViabilityService {
  private readonly logger = new Logger(ViabilityService.name)

  constructor(
    private prisma: PrismaService,
    private slackService: SlackService,
    private ballotReadyService: BallotReadyService,
  ) {}

  async calculateViabilityScore(campaignId: number): Promise<ViabilityScore> {
    let campaign: Campaign | null = null
    try {
      campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
      })
      if (!campaign) {
        throw new Error('Campaign not found')
      }

      const stateShort = campaign?.details?.state
      if (!stateShort) {
        throw new Error('State not found in campaign details')
      }
      const state = SHORT_TO_LONG_STATE[stateShort]
      if (!state) {
        throw new Error('State not found in SHORT_TO_LONG_STATE')
      }
      let officeLevel: string | undefined

      if (campaign?.details?.ballotLevel) {
        officeLevel = campaign.details.ballotLevel.toLowerCase()
      }

      let raceId: string | undefined
      let positionId: string | undefined
      if (campaign?.details?.raceId && campaign?.details?.positionId) {
        raceId = campaign.details.raceId
        positionId = campaign.details.positionId
        this.logger.debug('raceId', { raceId })
        this.logger.debug('positionId', { positionId })
      } else {
        throw new Error('RaceId not found')
      }
      const race =
        await this.ballotReadyService.fetchRacesWithOfficeHolders(raceId)
      if (!race) {
        throw new Error('Invalid race')
      }

      let isPartisan: boolean | undefined
      let seats: number | undefined
      this.logger.debug('positionId on race', { id: race.position?.id })
      if (race) {
        isPartisan = race.isPartisan || false
        seats = race.position?.seats || 0
      }

      let isIncumbent: boolean | undefined
      this.logger.debug('Checking officeHolders')
      const officeHolders = race?.position?.officeHolders || []
      if (officeHolders.nodes.length > 0) {
        this.logger.debug('officeHolders', { officeHolders })
        for (const officeHolder of officeHolders.nodes) {
          if (
            officeHolder &&
            officeHolder.person?.fullName.toLowerCase() ===
              campaign.data?.name?.toLowerCase()
          ) {
            // TODO: this seems too flimsy to rely on (what if name is slightly different?)
            isIncumbent = true
          }
        }
      } else {
        this.logger.debug('No office holders found')
      }

      let candidates = this.getBallotReadyCandidates(race, campaign)
      // openSeat is when the number of incumbents running is less than the number of seats available
      this.logger.debug('candidates', { candidates })
      let openSeat = false
      if (candidates === 1) {
        candidates = 1
        openSeat = true
      } else if (candidates > 1) {
        if (typeof seats === 'number' && seats > 0) {
          openSeat = candidates < seats
        }
      }

      const opponents = candidates - 1
      const officeType = this.getOfficeType(race.position?.name)

      this.logger.debug('data', {
        state,
        officeLevel,
        officeType,
        isPartisan,
        isIncumbent,
        seats,
        opponents,
        openSeat,
      })

      if (
        state === undefined ||
        officeLevel === undefined ||
        officeType === undefined ||
        isPartisan === undefined ||
        seats === undefined ||
        isIncumbent === undefined ||
        opponents === undefined ||
        openSeat === undefined
      ) {
        this.logger.error(
          `Cannot run Viability score. Missing required parameters`,
          {
            state,
            officeLevel,
            officeType,
            isPartisan,
            seats,
            isIncumbent,
            opponents,
            openSeat,
          },
        )
      } else {
        const viability = this.calculateNewViabilityScore(
          state,
          officeLevel,
          officeType,
          isPartisan,
          seats,
          isIncumbent,
          opponents,
          openSeat,
        )

        this.logger.debug('viability', { viability })

        return viability
      }
      return {
        level: '',
        isPartisan: false,
        isIncumbent: false,
        isUncontested: false,
        candidates: 0,
        seats: 0,
        candidatesPerSeat: 0,
        score: 0,
        probOfWin: 0,
      }
    } catch (e) {
      this.logger.error(
        `Error calculating viability score for campaign slug => ${campaign?.slug}`,
        e,
      )
      throw e
    }
  }

  getOfficeType(officeName: string): string {
    // TODO: consider passing the L2 Columns in here to get
    // a more accurate match, or consider using an AI model to
    // match the office name to the correct office type.
    const officeType = officeName.toLowerCase()
    if (officeType.includes('congress')) {
      return 'Congressional'
    }
    if (officeType.includes('senator')) {
      return 'State Senate'
    }
    if (officeType.includes('house')) {
      return 'State House'
    }
    if (officeType.includes('president')) {
      return 'President'
    }
    if (officeType.includes('governor')) {
      return 'Governor'
    }
    if (officeType.includes('state')) {
      return 'Statewide/Governor'
    }
    if (officeType.includes('county')) {
      return 'County Supervisor'
    }
    if (officeType.includes('sheriff')) {
      return 'Sheriff'
    }
    if (officeType.includes('mayor')) {
      return 'Mayor'
    }
    if (officeType.includes('city council')) {
      return 'City Council'
    }
    if (officeType.includes('school board')) {
      return 'School Board'
    }
    if (officeType.includes('judge')) {
      return 'Judge'
    }
    if (officeType.includes('town council')) {
      return 'Town Council'
    }
    if (officeType.includes('alderman')) {
      return 'Alderman'
    }
    if (officeType.includes('treasurer')) {
      return 'Treasurer'
    }
    if (officeType.includes('attorney')) {
      return 'Attorney'
    }
    if (officeType.includes('clerk')) {
      return 'Clerk'
    }

    return 'Other'
  }

  // This function is a wrapper to call the ported python code (getInitialViabilityScore)
  // It is separated so that we can easily update the getInitialViabilityScore function.
  calculateNewViabilityScore(
    state: string,
    officeLevel: string,
    officeType: string,
    electionPartisanship: boolean,
    seats: number,
    incumbent: boolean,
    opponents: number,
    openSeat: boolean,
  ): ViabilityScore {
    try {
      this.logger.log(
        `Calculating new viability score for ${state}, ${officeLevel}, ${officeType}`,
      )

      const { probOfWin, rating } = this.calculateInitialViability(
        state,
        officeLevel,
        officeType,
        electionPartisanship,
        seats,
        incumbent,
        opponents,
        openSeat,
      )

      // Format the viability score according to the existing interface
      const viabilityScore: ViabilityScore = {
        level: officeLevel,
        isPartisan: electionPartisanship,
        isIncumbent: incumbent,
        isUncontested: opponents === 0,
        candidates: opponents + 1, // Total candidates including the campaign
        seats: seats,
        candidatesPerSeat: (opponents + 1) / seats,
        score: rating,
        probOfWin,
      }

      return viabilityScore
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    } catch (error: unknown) {
      this.logger.error(`Error calculating new viability score`, { error })
      throw error
    }
  }

  /**
   * This function has been ported from python and will need to be updated
   * Calculates the initial viability score for a campaign based on various factors
   * @param state - The state where the election is taking place
   * @param officeLevel - The level of office (federal, regional, state, county, city, town, local)
   * @param officeType - The type of office being sought
   * @param electionPartisanship - Whether the election is partisan
   * @param seats - Number of seats available
   * @param incumbent - Whether the candidate is an incumbent
   * @param opponents - Number of opponents
   * @param openSeat - Open seat is when the number of incumbents running is less than the number of seats available
   * @returns An object containing the probability exponent, probability of winning, and rating (1-5)
   */
  calculateInitialViability(
    state: string,
    officeLevel: string,
    officeType: string,
    electionPartisanship: boolean,
    seats: number,
    incumbent: boolean,
    opponents: number,
    openSeat: boolean,
  ): { probExponent: number; probOfWin: number; rating: number } {
    // Implements a logistic regression term by term with co-efficients hard-coded
    let probExponent = -1.70059412

    // Incumbency
    if (incumbent) {
      probExponent += 1.45186084
    }

    // Race partisanship
    if (electionPartisanship) {
      probExponent += -1.00791154
    }

    // Open seat status
    if (openSeat) {
      probExponent += 0.41226921
    }

    // Office level
    const officeLevelLower = officeLevel.toLowerCase()
    if (officeLevelLower === 'federal') {
      probExponent += -12.58769739
    } else if (officeLevelLower === 'regional') {
      probExponent += -1.29313821
    } else if (officeLevelLower === 'state') {
      probExponent += -1.61385769
    } else if (officeLevelLower === 'county') {
      probExponent += -0.12648397
    } else if (officeLevelLower === 'city') {
      probExponent += 0
    } else if (officeLevelLower === 'town' || officeLevelLower === 'local') {
      probExponent += -0.19114514
    }

    // Seats and opponents
    probExponent += 0.65931675 * Math.log(Math.min(seats, 6))
    probExponent -= 0.84858689 * Math.log(Math.min(opponents + 1 - seats, 6))

    // State binning
    let stateBin = 5.5 // Default value for unmatched states

    const stateBin1 = [
      'Connecticut',
      'Illinois',
      'Missouri',
      'New Hampshire',
      'New Mexico',
      'Pennsylvania',
      'Colorado',
      'Hawaii',
      'Kansas',
      'West Virginia',
      'Wisconsin',
      'Alabama',
      'Idaho',
      'Massachusetts',
      'New York',
      'Ohio',
      'Georgia',
      'Iowa',
      'Nevada',
      'Oklahoma',
      'Rhode Island',
      'Utah',
      'Washington',
    ]

    const stateBin2 = [
      'Alaska',
      'Mississippi',
      'Montana',
      'Puerto Rico',
      'Florida',
      'Maryland',
      'North Carolina',
      'Oregon',
    ]

    const stateBin3 = ['South Carolina', 'California']
    const stateBin4 = ['Louisiana', 'Nebraska', 'Tennessee', 'Texas']
    const stateBin5 = [
      'Arkansas',
      'District Of Columbia',
      'Indiana',
      'Virginia',
      'Wyoming',
    ]
    const stateBin6 = ['Minnesota', 'New Jersey', 'North Dakota']
    const stateBin7 = ['Arizona', 'Delaware', 'Maine', 'Vermont', 'Michigan']
    const stateBin8 = ['Kentucky', 'Northern Mariana Islands', 'South Dakota']

    if (stateBin1.includes(state)) {
      stateBin = 1
    } else if (stateBin2.includes(state)) {
      stateBin = 2
    } else if (stateBin3.includes(state)) {
      stateBin = 3
    } else if (stateBin4.includes(state)) {
      stateBin = 4
    } else if (stateBin5.includes(state)) {
      stateBin = 5
    } else if (stateBin6.includes(state)) {
      stateBin = 6
    } else if (stateBin7.includes(state)) {
      stateBin = 7
    } else if (stateBin8.includes(state)) {
      stateBin = 8
    }

    probExponent += 0.08551596 * stateBin

    // Office type binning
    let officeTypeBin = 3 // Default value for unmatched office types

    const officeTypeBin1 = [
      'Congressional',
      'President',
      'State Senate',
      'Statewide/Governor',
      'State House',
      'County Supervisor',
      'Sheriff',
    ]

    const officeTypeBin2 = ['Attorney', 'Clerk/Treasurer', 'Mayor']
    const officeTypeBin3 = ['Other', 'City Council']
    const officeTypeBin4 = ['School Board', 'Alderman']
    const officeTypeBin5 = ['Judge', 'Town Council']

    if (officeTypeBin1.includes(officeType)) {
      officeTypeBin = 1
    } else if (officeTypeBin2.includes(officeType)) {
      officeTypeBin = 2
    } else if (officeTypeBin3.includes(officeType)) {
      officeTypeBin = 3
    } else if (officeTypeBin4.includes(officeType)) {
      officeTypeBin = 4
    } else if (officeTypeBin5.includes(officeType)) {
      officeTypeBin = 5
    }

    probExponent += 0.23143397 * officeTypeBin

    // Calculate probability of winning
    const probOfWin = 1 / (1 + Math.exp(-probExponent))
    const rating = Math.ceil(probOfWin * 5)

    return { probExponent, probOfWin, rating }
  }

  private getBallotReadyCandidates(
    race: RaceWithOfficeHoldersNode,
    campaign: Campaign,
  ): number {
    // todo: we may need to add pagination to the officeHolders
    const candidacies = race?.candidacies || []
    if (!candidacies.length) return 0

    const candidateSet = new Set<string>()
    const campaignName = (campaign?.data?.name || '').toLowerCase()
    const electionDate = new Date(campaign?.details?.electionDate || '')

    for (const candidacy of candidacies) {
      if (this.shouldAddCandidate(candidacy, campaignName, electionDate)) {
        candidateSet.add(candidacy.candidate!.fullName!)
      }
    }

    return candidateSet.size + 1 // +1 to include our candidate
  }

  private shouldAddCandidate(
    candidacy: RaceWithOfficeHoldersNode['candidacies'][0],
    campaignName: string,
    electionDate: Date,
  ): boolean {
    if (!candidacy?.candidate?.fullName) return false

    const candidateName = candidacy.candidate.fullName.toLowerCase()
    if (candidateName === campaignName) return false

    const candidacyDate = candidacy.election?.electionDay
      ? new Date(candidacy.election.electionDay)
      : null

    if (!candidacyDate) return true

    const dateComparison = this.compareDates(candidacyDate, electionDate)
    return this.isEligibleCandidate(
      candidacy.result as 'WON' | 'LOST' | null,
      dateComparison,
    )
  }

  private compareDates(date1: Date, date2: Date): 'before' | 'same' | 'after' {
    if (date1 < date2) return 'before'
    if (date1.getTime() === date2.getTime()) return 'same'
    return 'after'
  }

  private isEligibleCandidate(
    result: 'WON' | 'LOST' | null | undefined,
    dateComparison: 'before' | 'same' | 'after',
  ): boolean {
    if (dateComparison === 'before') {
      return result === 'WON' || !result
    }
    if (dateComparison === 'same') {
      return result !== 'LOST'
    }
    return true
  }
}
