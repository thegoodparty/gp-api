import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { Campaign, PathToVictory, Prisma } from '@prisma/client'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { CampaignCreatedBy, ElectionLevel } from 'src/campaigns/campaigns.types'
import { ElectionsService } from 'src/elections/services/elections.service'
import { DateFormats, formatDate } from 'src/shared/util/date.util'
import { SlackChannel } from 'src/vendors/slack/slackService.types'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { P2VStatus } from '../../elections/types/pathToVictory.types'
import { EmailService } from '../../email/email.service'
import { EmailTemplateName } from '../../email/email.types'
import { PrismaService } from '../../prisma/prisma.service'
import { createPrismaBase, MODELS } from '../../prisma/util/prisma.util'
import { SlackService } from '../../vendors/slack/services/slack.service'
import {
  P2VCounts,
  P2VSource,
  PathToVictoryInput,
  PathToVictoryResponse,
} from '../types/pathToVictory.types'
import { OfficeMatchService } from './officeMatch.service'

enum SpecialOfficePhrase {
  AtLarge = 'At Large',
  PresidentOfUS = 'President of the United States',
  Senate = 'Senate',
  Governor = 'Governor',
  Mayor = 'Mayor',
}

const SPECIAL_OFFICE_PHRASES = Object.freeze(Object.values(SpecialOfficePhrase))

const FEDERAL_SPECIAL_PHRASES = Object.freeze([
  SpecialOfficePhrase.PresidentOfUS,
  SpecialOfficePhrase.Senate,
])

@Injectable()
export class PathToVictoryService extends createPrismaBase(
  MODELS.PathToVictory,
) {
  private buildOfficeFingerprint(params: {
    officeName: string
    electionLevel: string
    electionState: string
    electionCounty: string
    electionMunicipality: string
    subAreaName?: string
    subAreaValue?: string
    positionId?: string
  }): string {
    const {
      officeName,
      electionLevel,
      electionState,
      electionCounty,
      electionMunicipality,
      subAreaName,
      subAreaValue,
      positionId,
    } = params
    return [
      officeName,
      electionLevel,
      electionState,
      electionCounty,
      electionMunicipality,
      subAreaName ?? '',
      subAreaValue ?? '',
      positionId ?? '',
    ].join('|')
  }
  constructor(
    private prisma: PrismaService,
    private officeMatchService: OfficeMatchService,
    private slackService: SlackService,
    private emailService: EmailService,
    @Inject(forwardRef(() => CrmCampaignsService))
    private crmService: CrmCampaignsService,
    @Inject(forwardRef(() => AnalyticsService))
    private analytics: AnalyticsService,
    private elections: ElectionsService,
  ) {
    super()
  }

  create<T extends Prisma.PathToVictoryCreateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PathToVictoryCreateArgs>,
  ): Promise<Prisma.PathToVictoryGetPayload<T>> {
    return this.model.create(args)
  }

  update<T extends Prisma.PathToVictoryUpdateArgs>(
    args: Prisma.SelectSubset<T, Prisma.PathToVictoryUpdateArgs>,
  ): Promise<Prisma.PathToVictoryGetPayload<T>> {
    return this.model.update(args)
  }

  async handlePathToVictory(input: PathToVictoryInput): Promise<{
    slug: string
    pathToVictoryResponse: PathToVictoryResponse
  }> {
    const pathToVictoryResponse: PathToVictoryResponse = {
      electionType: '',
      electionLocation: '',
      district: '',
      counts: {
        projectedTurnout: 0,
        winNumber: 0,
        voterContactGoal: 0,
      },
    }

    this.logger.debug(`Starting p2v for ${input.slug}`)

    try {
      let searchColumns: string[] = ['']

      // Always recompute potential district columns based on the latest office info.
      // Do not rely on any previously provided electionType/electionLocation values.

      if (
        !SPECIAL_OFFICE_PHRASES.some((phrase) =>
          input.officeName.includes(phrase),
        )
      ) {
        // Use unified, API-driven district type discovery
        searchColumns = await this.officeMatchService.searchDistrictTypes(
          input.slug,
          input.officeName,
          input.electionLevel as ElectionLevel,
          input.electionState,
          input.subAreaName,
          input.subAreaValue,
        )
      }

      let attempts = 1
      if (!searchColumns || searchColumns.length === 0) {
        this.logger.warn(
          `No district type candidates returned for slug=${input.slug}, office="${input.officeName}"`,
        )
      } else {
        this.logger.debug(
          `District type candidates for slug=${input.slug}: ${JSON.stringify(searchColumns)}`,
        )
      }
      for (const searchColumn of searchColumns) {
        // Always start fresh for each attempt; do not carry forward any previous district values.
        let electionType = ''
        let electionLocation = ''

        this.logger.debug(
          `Attempt ${attempts}: resolving column "${searchColumn}"`,
        )
        const columnResponse = await this.officeMatchService.getSearchColumn(
          input.slug,
          searchColumn,
          input.electionState,
          this.getSearchString(input),
          '',
          input.electionDate,
        )

        if (!columnResponse) {
          this.logger.debug(
            `Attempt ${attempts}: no match from getSearchColumn for "${searchColumn}"`,
          )
          continue
        }

        electionType = columnResponse.column
        electionLocation = columnResponse.value

        if (
          (input.electionLevel as ElectionLevel) === ElectionLevel.federal &&
          (FEDERAL_SPECIAL_PHRASES.some((p) => input.officeName.includes(p)) ||
            input.officeName.includes(SpecialOfficePhrase.Governor)) &&
          (!electionType || !electionLocation)
        ) {
          continue
        }

        this.logger.debug(
          `Found Column! Election Type: ${electionType}. Location: ${electionLocation}`,
        )

        const state =
          input.officeName === SpecialOfficePhrase.PresidentOfUS
            ? 'US'
            : input.electionState

        const raceTargetDetails = await this.elections.buildRaceTargetDetails({
          L2DistrictType: electionType,
          L2DistrictName: electionLocation,
          electionDate: input.electionDate,
          state,
        })

        if (raceTargetDetails?.projectedTurnout) {
          const { projectedTurnout, winNumber, voterContactGoal } =
            raceTargetDetails

          // We only accept matches that we have a projected turnout for
          if (projectedTurnout <= 0) continue

          pathToVictoryResponse.electionType = electionType
          pathToVictoryResponse.electionLocation = electionLocation
          pathToVictoryResponse.counts = {
            projectedTurnout: projectedTurnout ?? 0,
            winNumber: winNumber ?? 0,
            voterContactGoal: voterContactGoal ?? 0,
          }
          break
        }

        this.logger.debug(
          `Attempt ${attempts}: no projectedTurnout for type=${electionType}, location="${electionLocation}"`,
        )
        if (++attempts > 10) break
      }

      return {
        pathToVictoryResponse,
        ...input,
      }
    } catch (error: unknown) {
      const err: Error =
        error instanceof Error ? error : new Error(String(error))
      this.logger.error('Error in handle-p2v', err)
      await this.slackService.errorMessage({
        message: 'Error in handle-p2v',
        error: { message: err.message, stack: err.stack },
      })
      throw new Error('Error in handle-p2v')
    }
  }

  private getSearchString(input: PathToVictoryInput): string {
    const parts = [
      input.officeName,
      input.subAreaName,
      input.subAreaValue,
      input.electionCounty,
      input.electionMunicipality,
      input.electionState,
    ].filter(Boolean)

    const searchString = parts.join('- ')
    this.logger.debug(`searchString: ${searchString}`)
    return searchString
  }

  async analyzePathToVictoryResponse(p2vResponse: {
    campaign: Campaign & { pathToVictory: PathToVictory }
    pathToVictoryResponse: {
      counts: P2VCounts
      electionType: string
      electionLocation: string
    }
    officeName: string
    electionDate: string
    electionTerm: number
    electionLevel: string
    electionState: string
    electionCounty: string
    electionMunicipality: string
    subAreaName?: string
    subAreaValue?: string
    partisanType: string
    priorElectionDates: string[]
    positionId?: string
  }): Promise<boolean> {
    const {
      campaign,
      pathToVictoryResponse,
      officeName,
      electionDate,
      electionTerm,
      electionLevel,
      electionState,
      electionCounty,
      electionMunicipality,
      subAreaName,
      subAreaValue,
      partisanType,
      priorElectionDates,
      positionId,
    } = p2vResponse

    const candidateSlackMessage = `
    • Candidate: ${campaign?.data?.name} [${campaign?.slug}]
    • Office: ${officeName}
    • Election Date: ${electionDate}
    • Prior Election Dates: ${priorElectionDates}
    • Election Term: ${electionTerm}
    • Election Level: ${electionLevel}
    • Election State: ${electionState}
    • Election County: ${electionCounty}
    • Election Municipality: ${electionMunicipality}
    • Sub Area Name: ${subAreaName}
    • Sub Area Value: ${subAreaValue}
    • Partisan Type: ${partisanType}
    `

    const pathToVictorySlackMessage = `
    ￮ L2 DistrictType/ElectionType: ${pathToVictoryResponse.electionType}
    ￮ L2 DistrictName/ElectionLocation: ${pathToVictoryResponse.electionLocation}
    `

    const officeContext = {
      officeName,
      electionLevel,
      electionState,
      electionCounty,
      electionMunicipality,
      subAreaName,
      subAreaValue,
      positionId,
    }
    const officeFingerprint = this.buildOfficeFingerprint(officeContext)

    if (
      pathToVictoryResponse.counts.projectedTurnout &&
      pathToVictoryResponse.counts.projectedTurnout > 0
    ) {
      const turnoutSlackMessage = `
      ￮ Projected Turnout: ${pathToVictoryResponse.counts.projectedTurnout}
      ￮ Win Number: ${pathToVictoryResponse.counts.winNumber}
      ￮ Voter Contact Goal: ${pathToVictoryResponse.counts.voterContactGoal}
      `

      await this.slackService.formattedMessage({
        message:
          candidateSlackMessage +
          pathToVictorySlackMessage +
          turnoutSlackMessage,
        channel: SlackChannel.botPathToVictory,
      })

      if (campaign.pathToVictory?.data?.p2vStatus === P2VStatus.complete) {
        this.logger.debug(
          'Path To Victory already completed for',
          campaign.slug,
        )
        await this.completePathToVictory(campaign.slug, pathToVictoryResponse, {
          sendEmail: false,
          officeFingerprint,
        })
        return true
      } else {
        await this.completePathToVictory(campaign.slug, pathToVictoryResponse, {
          sendEmail: true,
          officeFingerprint,
        })
        return true
      }
    } else {
      let debugMessage = 'No Path To Victory Found with projected turnout.\n'
      if (pathToVictoryResponse) {
        debugMessage +=
          'pathToVictoryResponse: ' + JSON.stringify(pathToVictoryResponse)
      }
      await this.slackService.formattedMessage({
        message: candidateSlackMessage + debugMessage,
        channel: SlackChannel.botPathToVictoryIssues,
      })
      // Mark as Failed
      await this.completePathToVictory(campaign.slug, pathToVictoryResponse, {
        sendEmail: false,
        p2vStatusOverride: P2VStatus.failed,
        officeFingerprint,
      })
      await this.crmService.handleUpdateCampaign(
        campaign,
        'path_to_victory_status',
        P2VStatus.failed,
      )
      return false
    }
  }

  async completePathToVictory(
    slug: string,
    pathToVictoryResponse: {
      counts: P2VCounts
      electionType: string
      electionLocation: string
    },
    options?: {
      sendEmail?: boolean
      p2vStatusOverride?: P2VStatus
      officeFingerprint?: string
    },
  ): Promise<void> {
    this.logger.debug('completing path to victory for', slug)
    this.logger.debug('pathToVictoryResponse', pathToVictoryResponse)

    try {
      const campaign = await this.prisma.campaign.findUnique({
        where: { slug },
        include: { user: true, pathToVictory: true },
      })

      if (!campaign) {
        this.logger.error('no campaign found for slug', slug)
        await this.slackService.errorMessage({
          message: `no campaign found for slug ${slug}`,
        })
        return
      }

      let p2v = campaign.pathToVictory

      if (!p2v) {
        p2v = await this.prisma.pathToVictory.create({
          data: {
            campaign: { connect: { id: campaign.id } },
          },
        })
      }

      const p2vStatus: P2VStatus =
        options?.p2vStatusOverride ??
        (pathToVictoryResponse?.counts?.projectedTurnout &&
        pathToVictoryResponse.counts.projectedTurnout > 0
          ? P2VStatus.complete
          : P2VStatus.waiting)

      const p2vData = (p2v.data || {}) as PrismaJson.PathToVictoryData

      // Detect office/district change using an office fingerprint stored on P2V.data
      const previousOfficeFingerprint: string | null =
        p2vData.officeContextFingerprint ?? null
      const hasOfficeChanged =
        !!options?.officeFingerprint &&
        options.officeFingerprint !== previousOfficeFingerprint

      if (hasOfficeChanged) {
        this.logger.debug(
          `Office changed; resetting prior P2V fields for ${slug}`,
        )
      }

      // Build a base data object, optionally clearing stale fields if office changed
      let baseData: Partial<PrismaJson.PathToVictoryData>
      if (hasOfficeChanged) {
        const {
          projectedTurnout: _pt,
          winNumber: _wn,
          voterContactGoal: _vcg,
          viability: _viability,
          p2vAttempts: _attempts,
          p2vCompleteDate: _p2vCompleteDate,
          p2vStatus: _p2vStatus,
          // electionType and electionLocation will be overwritten below
          electionType: _oldElectionType,
          electionLocation: _oldElectionLocation,
          ...rest
        } = p2vData
        baseData = rest as Partial<PrismaJson.PathToVictoryData>
      } else {
        baseData = { ...p2vData }
      }
      await this.prisma.pathToVictory.update({
        where: { id: p2v.id },
        data: {
          data: {
            ...baseData,
            projectedTurnout: Number(
              pathToVictoryResponse.counts?.projectedTurnout ?? 0,
            ),
            winNumber: Number(pathToVictoryResponse.counts?.winNumber ?? 0),
            voterContactGoal: Number(
              pathToVictoryResponse.counts?.voterContactGoal ?? 0,
            ),
            electionType: pathToVictoryResponse.electionType,
            electionLocation: pathToVictoryResponse.electionLocation,
            ...(hasOfficeChanged ? { p2vAttempts: 0 } : {}),
            p2vCompleteDate: formatDate(new Date(), DateFormats.isoDate),
            p2vStatus,
            source: P2VSource.GpApi,
            ...(options?.officeFingerprint
              ? { officeContextFingerprint: options.officeFingerprint }
              : {}),
          },
        },
      })

      await this.analytics.identify(campaign.userId, {
        winNumber: pathToVictoryResponse.counts.winNumber,
      })

      const shouldSendEmail = options?.sendEmail ?? true
      if (p2vStatus === 'Complete' && shouldSendEmail && campaign.user?.email) {
        const name = campaign.user
          ? await this.getUserName(campaign.user)
          : 'Friend'
        const variables = {
          name,
          link: `${process.env.WEBAPP_ROOT}/dashboard`,
        }

        if (
          process.env.WEBAPP_ROOT === 'https://goodparty.org' &&
          campaign?.data?.createdBy !== CampaignCreatedBy.ADMIN
        ) {
          this.logger.debug('sending email to user', campaign.user.email)
          await this.emailService.sendTemplateEmail({
            to: campaign.user.email,
            subject: 'Exciting News: Your Customized Campaign Plan is Updated!',
            template: EmailTemplateName.candidateVictoryReady,
            variables,
            cc: 'jared@goodparty.org',
          })
        }
      }

      await this.crmService.handleUpdateCampaign(
        campaign,
        'path_to_victory_status',
        p2vStatus,
      )
    } catch (error: unknown) {
      const err: Error =
        error instanceof Error ? error : new Error(String(error))
      this.logger.error('error updating campaign', err)
      await this.slackService.errorMessage({
        message: 'error updating campaign with path to victory',
        error: { message: err.message, stack: err.stack },
      })
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getUserName(user: any): Promise<string> {
    return user.name || 'Friend'
  }
}

export interface P2VResponse {
  slug: string
  pathToVictoryResponse: PathToVictoryResponse
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}
