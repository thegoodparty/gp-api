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
    let candidates = 0
    const candidateSet = new Set<string>()
    const candidacies = race?.candidacies || []

    if (candidacies && candidacies.length > 0) {
      this.logger.debug('candidacies', { candidacies })

      for (const candidacy of candidacies) {
        let candidacyName = candidacy?.candidate?.fullName || ''
        candidacyName = candidacyName.toLowerCase()

        let candidateName = campaign?.data?.name || ''
        candidateName = candidateName.toLowerCase()

        const candidacyElectionDay = candidacy?.election?.electionDay
        this.logger.debug('candidacyElectionDay', { candidacyElectionDay })

        const candidacyDate = candidacyElectionDay
          ? new Date(candidacyElectionDay)
          : null
        const electionDate = new Date(campaign?.details?.electionDate || '')

        this.logger.debug('comparison dates', {
          candidacyName,
          candidateName,
          candidacyDate,
          electionDate,
        })

        if (candidacyDate && candidacyDate < electionDate) {
          this.logger.debug('candidacyDate < electionDate')
          if (candidacy.result === 'LOST') {
            if (candidacyName === candidateName) {
              continue // we lost a primary
            }
            // rival candidate is no longer in the running
            this.logger.debug('skipping candidate', {
              name: candidacy?.candidate?.fullName,
            })
          } else if (candidacy.result === 'WON') {
            if (candidacyName === candidateName) {
              // we won the primary
            } else {
              this.logger.debug('adding candidate', {
                name: candidacy?.candidate?.fullName,
              })
              if (candidacy?.candidate?.fullName) {
                candidateSet.add(candidacy.candidate.fullName)
              }
            }
          } else {
            if (
              candidacyName !== candidateName &&
              candidacy?.candidate?.fullName
            ) {
              this.logger.debug('adding candidate', {
                name: candidacy.candidate.fullName,
              })
              candidateSet.add(candidacy.candidate.fullName)
            }
          }
        } else if (
          candidacyDate &&
          candidacyDate.getTime() === electionDate.getTime()
        ) {
          this.logger.debug('candidacyDate === electionDate')
          if (candidacy.result === 'LOST') {
            if (candidacyName === candidateName) {
              continue // we lost the election
            }
          } else if (candidacy.result === 'WON') {
            if (
              candidacyName !== candidateName &&
              candidacy?.candidate?.fullName
            ) {
              this.logger.debug('adding candidate', {
                name: candidacy.candidate.fullName,
              })
              candidateSet.add(candidacy.candidate.fullName)
            }
          } else if (
            candidacyName !== candidateName &&
            candidacy?.candidate?.fullName
          ) {
            this.logger.debug('adding candidate', {
              name: candidacy.candidate.fullName,
            })
            candidateSet.add(candidacy.candidate.fullName)
          }
        } else {
          this.logger.debug('candidacyDate > electionDate')
          if (
            candidacyName !== candidateName &&
            candidacy?.candidate?.fullName
          ) {
            this.logger.debug('adding candidate', {
              name: candidacy.candidate.fullName,
            })
            candidateSet.add(candidacy.candidate.fullName)
          }
        }
      }
    }

    if (candidacies.length > 0) {
      this.logger.debug('candidateSet', { candidateSet })
      const candidateArray = Array.from(candidateSet)
      this.logger.debug('candidateArray', { candidateArray })
      candidates = candidateArray.length
      candidates++ // increment by 1 to include our candidate
    }

    return candidates
  }
}
