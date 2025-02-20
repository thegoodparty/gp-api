import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { SlackService } from '../../shared/services/slack.service'
import { Campaign } from '@prisma/client'
import { ViabilityScore } from '../types/pathToVictory.types'
import { BallotReadyService } from 'src/elections/services/ballotReady.service'
import { RaceWithOfficeHoldersNode } from 'src/elections/types/ballotReady.types'

@Injectable()
export class ViabilityService {
  private readonly logger = new Logger(ViabilityService.name)

  constructor(
    private prisma: PrismaService,
    private slackService: SlackService,
    private ballotReadyService: BallotReadyService,
  ) {}

  async calculateViabilityScore(campaignId: number): Promise<ViabilityScore> {
    try {
      const viability: ViabilityScore = {
        level: '',
        isPartisan: '',
        isIncumbent: '',
        isUncontested: '',
        candidates: '',
        seats: '',
        candidatesPerSeat: '',
        score: 0,
      }

      const campaign = await this.prisma.campaign.findUnique({
        where: { id: campaignId },
      })

      if (!campaign) {
        throw new Error('Campaign not found')
      }

      if (campaign?.details?.ballotLevel) {
        viability.level = campaign.details.ballotLevel.toLowerCase()
      }

      let raceId
      let positionId
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

      this.logger.debug('positionId on race', { id: race.position?.id })
      if (race) {
        viability.isPartisan = race.isPartisan || false
        viability.seats = race.position?.seats || 0
      }

      let isIncumbent: boolean | undefined
      let isUncontested: boolean | undefined

      if (isIncumbent === undefined) {
        this.logger.debug('Checking officeHolders')
        const officeHolders = race?.position?.officeHolders || []
        if (officeHolders.nodes.length > 0) {
          for (const officeHolder of officeHolders.nodes) {
            if (
              officeHolder &&
              officeHolder.person?.fullName.toLowerCase() ===
                campaign.data?.name?.toLowerCase()
            ) {
              isIncumbent = true
            }
          }
        }
      }

      if (isIncumbent !== undefined) {
        viability.isIncumbent = isIncumbent
      }
      if (isUncontested !== undefined) {
        viability.isUncontested = isUncontested
      }

      const candidates = this.getBallotReadyCandidates(race, campaign)

      this.logger.debug('candidates', { candidates })
      if (candidates === 1) {
        viability.isUncontested = true
        viability.candidates = 1
        viability.candidatesPerSeat = 1
      } else if (candidates > 1) {
        viability.candidates = candidates
        if (typeof viability.seats === 'number' && viability.seats > 0) {
          viability.candidatesPerSeat = Math.ceil(candidates / viability.seats)
        }
      }

      viability.score = this.calculateScore(viability)

      return viability
    } catch (e) {
      this.logger.error('Error calculating viability score', e)
      await this.slackService.errorMessage({
        message: 'Error calculating viability score',
        error: e,
      })
      throw e
    }
  }

  private calculateScore(viability: ViabilityScore): number {
    let score = 0

    if (viability.level) {
      if (viability.level === 'city' || viability.level === 'local') {
        score += 1
      } else if (viability.level === 'county') {
        score += 1
      } else if (viability.level === 'state') {
        score += 0.5
      }
    }

    if (typeof viability.isPartisan === 'boolean') {
      score += viability.isPartisan ? 0.25 : 1
    }

    if (typeof viability.isIncumbent === 'boolean') {
      score += viability.isIncumbent ? 1 : 0.5
    }

    if (
      typeof viability.isUncontested === 'boolean' &&
      viability.isUncontested
    ) {
      return score + 5
    }

    if (typeof viability.candidates === 'number' && viability.candidates > 0) {
      const candidatesPerSeat =
        typeof viability.candidatesPerSeat === 'number'
          ? viability.candidatesPerSeat
          : 0

      if (candidatesPerSeat <= 2) {
        score += 0.75
      } else if (candidatesPerSeat === 3) {
        score += 0.5
      } else if (candidatesPerSeat >= 4) {
        score += 0.25
      }
    } else {
      score += 0.25
    }

    return score
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
