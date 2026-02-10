import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { Campaign, PathToVictory, Prisma } from '@prisma/client'
import { serializeError } from 'serialize-error'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { CampaignCreatedBy, ElectionLevel } from 'src/campaigns/campaigns.types'
import { ElectionsService } from 'src/elections/services/elections.service'
import { recordCustomEvent } from 'src/observability/newrelic/newrelic.client'
import { CustomEventType } from 'src/observability/newrelic/newrelic.events'
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
      let lastMatchedDistrictType: string | undefined
      let lastMatchedDistrictName: string | undefined

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

        lastMatchedDistrictType = electionType
        lastMatchedDistrictName = electionLocation

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

      const hasTurnout = pathToVictoryResponse.counts.projectedTurnout > 0
      // If no turnout was found but a district was matched, preserve the district info
      // and use sentinel -1 values to signal "district matched, no turnout" (consistent
      // with the gold flow). This ensures completePathToVictory overwrites stale turnout.
      if (!hasTurnout && lastMatchedDistrictType && lastMatchedDistrictName) {
        pathToVictoryResponse.electionType = lastMatchedDistrictType
        pathToVictoryResponse.electionLocation = lastMatchedDistrictName
        pathToVictoryResponse.counts = {
          projectedTurnout: -1,
          winNumber: -1,
          voterContactGoal: -1,
        }
      }
      const hasDistrict =
        !!pathToVictoryResponse.electionType &&
        !!pathToVictoryResponse.electionLocation
      const reason = hasTurnout
        ? undefined
        : hasDistrict
          ? 'no_projected_turnout'
          : 'no_district_match'
      const result = hasTurnout
        ? 'success'
        : hasDistrict
          ? 'partial'
          : 'failure'

      this.logger.log(
        JSON.stringify({
          event: 'DistrictMatch',
          matchType: 'silver',
          result,
          reason,
          slug: input.slug,
          campaignId: input.campaignId,
          officeName: input.officeName,
          electionState: input.electionState,
          electionLevel: input.electionLevel,
          electionDate: input.electionDate,
          L2DistrictType:
            pathToVictoryResponse.electionType || lastMatchedDistrictType,
          L2DistrictName:
            pathToVictoryResponse.electionLocation || lastMatchedDistrictName,
          projectedTurnout:
            pathToVictoryResponse.counts.projectedTurnout || undefined,
        }),
      )

      return {
        pathToVictoryResponse,
        ...input,
      }
    } catch (error: unknown) {
      const err: Error =
        error instanceof Error ? error : new Error(String(error))

      this.logger.log(
        JSON.stringify({
          event: 'DistrictMatch',
          matchType: 'silver',
          result: 'failure',
          reason: error instanceof Error ? error.message : String(error),
          error: serializeError(error),
          slug: input.slug,
          campaignId: input.campaignId,
          officeName: input.officeName,
          electionState: input.electionState,
          electionLevel: input.electionLevel,
          electionDate: input.electionDate,
          errorMessage: err.message,
        }),
      )

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

    const hasTurnout =
      !!pathToVictoryResponse.counts.projectedTurnout &&
      pathToVictoryResponse.counts.projectedTurnout > 0

    let sendEmailFlag = false
    let statusOverride: P2VStatus | undefined

    if (hasTurnout) {
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

      // Do not re-email if already completed previously
      sendEmailFlag =
        campaign.pathToVictory?.data?.p2vStatus !== P2VStatus.complete
    } else {
      const hasDistrict =
        !!pathToVictoryResponse.electionType &&
        !!pathToVictoryResponse.electionLocation

      if (hasDistrict) {
        // District matched but no projected turnout available
        await this.slackService.formattedMessage({
          message:
            candidateSlackMessage +
            pathToVictorySlackMessage +
            '\nDistrict matched but no projected turnout available.',
          channel: SlackChannel.botPathToVictoryIssues,
        })
        statusOverride = P2VStatus.districtMatched

        await this.crmService.handleUpdateCampaign(
          campaign,
          'path_to_victory_status',
          P2VStatus.districtMatched,
        )
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
        statusOverride = P2VStatus.failed

        recordCustomEvent(CustomEventType.BlockedState, {
          service: 'gp-api',
          environment: process.env.NODE_ENV,
          userId: campaign.userId,
          campaignId: campaign.id,
          slug: campaign.slug,
          feature: 'path_to_victory',
          rootCause: 'p2v_failed',
          isBackground: true,
          reason: 'no_district_match',
        })

        await this.crmService.handleUpdateCampaign(
          campaign,
          'path_to_victory_status',
          P2VStatus.failed,
        )
      }
    }

    // Only call completePathToVictory when silver actually found turnout.
    // When silver fails (district-only or nothing), skip it entirely so gold's
    // authoritative data (district, sentinels, source=ElectionApi) is preserved.
    // Returning false lets handlePathToVictoryFailure track p2vAttempts and
    // handle retries (up to 3) or final status.
    if (hasTurnout) {
      await this.completePathToVictory(campaign.slug, pathToVictoryResponse, {
        sendEmail: sendEmailFlag,
        p2vStatusOverride: statusOverride,
        officeFingerprint,
      })
    }
    return hasTurnout
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
    this.logger.debug(
      JSON.stringify({
        slug,
        pathToVictoryResponse,
        msg: 'completing path to victory',
      }),
    )

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

      const p2vData = (p2v.data || {}) as PrismaJson.PathToVictoryData
      const existingStatus = p2vData.p2vStatus as P2VStatus | undefined

      let p2vStatus: P2VStatus =
        options?.p2vStatusOverride ??
        (pathToVictoryResponse?.counts?.projectedTurnout &&
        pathToVictoryResponse.counts.projectedTurnout > 0
          ? P2VStatus.complete
          : P2VStatus.waiting)

      // Don't downgrade status: if gold flow already set a better status,
      // don't let a failing silver flow overwrite it
      const STATUS_RANK: Record<string, number> = {
        [P2VStatus.failed]: 0,
        [P2VStatus.waiting]: 1,
        [P2VStatus.districtMatched]: 2,
        [P2VStatus.complete]: 3,
      }

      if (
        existingStatus &&
        (STATUS_RANK[existingStatus] ?? 0) > (STATUS_RANK[p2vStatus] ?? 0)
      ) {
        p2vStatus = existingStatus
      }

      // If the existing record has district data (possibly from gold flow),
      // ensure the status is at least DistrictMatched, even if createPathToVictory
      // reset it to Waiting due to a race condition.
      const existingHasDistrict =
        !!p2vData.electionType && !!p2vData.electionLocation
      if (
        existingHasDistrict &&
        (STATUS_RANK[p2vStatus] ?? 0) <
          (STATUS_RANK[P2VStatus.districtMatched] ?? 0)
      ) {
        p2vStatus = P2VStatus.districtMatched
      }

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

      // Build a base data object, optionally clearing stale fields if office changed.
      // When office changed, strip turnout/viability/attempts/status but KEEP
      // district data (electionType, electionLocation) it may have been set by
      // the gold flow and we should only overwrite it if we have better data.
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
          ...rest
        } = p2vData
        baseData = rest as Partial<PrismaJson.PathToVictoryData>
      } else {
        baseData = { ...p2vData }
      }
      // Only overwrite district/turnout fields if the new response has meaningful data.
      // This prevents a failing silver flow from wiping out data set by a prior gold flow.
      const incomingTurnout = Number(
        pathToVictoryResponse.counts?.projectedTurnout ?? 0,
      )
      const incomingHasDistrict =
        !!pathToVictoryResponse.electionType &&
        !!pathToVictoryResponse.electionLocation
      // Only overwrite when we have actual data to write.
      // Do NOT use hasOfficeChanged for district — the gold flow may have already
      // written correct district data for the new office, and wiping it with empty
      // strings would lose that data.
      // For turnout: overwrite when we have real data (> 0) OR sentinel values (-1,
      // meaning "district matched, no turnout"). Only skip overwrite when incoming
      // is exactly 0 (total failure) — unless office changed, in which case stale
      // turnout was already stripped from baseData and we should write whatever we have.
      const shouldOverwriteDistrict = incomingHasDistrict
      const shouldOverwriteTurnout = incomingTurnout !== 0 || hasOfficeChanged

      await this.prisma.pathToVictory.update({
        where: { id: p2v.id },
        data: {
          data: {
            ...baseData,
            ...(shouldOverwriteTurnout
              ? {
                  projectedTurnout: incomingTurnout,
                  winNumber: Number(
                    pathToVictoryResponse.counts?.winNumber ?? 0,
                  ),
                  voterContactGoal: Number(
                    pathToVictoryResponse.counts?.voterContactGoal ?? 0,
                  ),
                }
              : {}),
            ...(shouldOverwriteDistrict
              ? {
                  electionType: pathToVictoryResponse.electionType,
                  electionLocation: pathToVictoryResponse.electionLocation,
                }
              : {}),
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
