import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { Campaign, PathToVictory, Prisma } from '@prisma/client'
import { serializeError } from 'serialize-error'
import { AnalyticsService } from 'src/analytics/analytics.service'
import { ElectionLevel } from 'src/campaigns/campaigns.types'
import { ElectionsService } from 'src/elections/services/elections.service'
import { recordCustomEvent } from 'src/observability/newrelic/newrelic.client'
import { CustomEventType } from 'src/observability/newrelic/newrelic.events'
import {
  DEFAULT_PAGINATION_LIMIT,
  DEFAULT_PAGINATION_OFFSET,
  DEFAULT_SORT_BY,
  DEFAULT_SORT_ORDER,
} from 'src/shared/constants/paginationOptions.consts'
import { PaginatedResults } from 'src/shared/types/utility.types'
import { DateFormats, formatDate } from 'src/shared/util/date.util'
import { SlackChannel } from 'src/vendors/slack/slackService.types'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { P2VStatus } from '../../elections/types/pathToVictory.types'
import { PrismaService } from '../../prisma/prisma.service'
import { createPrismaBase, MODELS } from '../../prisma/util/prisma.util'
import { SlackService } from '../../vendors/slack/services/slack.service'
import {
  P2VCounts,
  P2VSource,
  PathToVictoryInput,
  PathToVictoryResponse,
} from '../types/pathToVictory.types'
import { ListPathToVictoryPaginationSchema } from '../schemas/ListPathToVictoryPagination.schema'
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

  async listPathToVictories({
    offset: skip = DEFAULT_PAGINATION_OFFSET,
    limit = DEFAULT_PAGINATION_LIMIT,
    sortBy = DEFAULT_SORT_BY,
    sortOrder = DEFAULT_SORT_ORDER,
    userId,
  }: ListPathToVictoryPaginationSchema): Promise<
    PaginatedResults<PathToVictory>
  > {
    const where: Prisma.PathToVictoryWhereInput = {
      ...(userId ? { campaign: { userId } } : {}),
    }

    return {
      data: await this.model.findMany({
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        where,
      }),
      meta: {
        total: await this.model.count({ where }),
        offset: skip,
        limit,
      },
    }
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

  /**
   * Analyzes silver flow results and determines if P2V was successful.
   */
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
    // Fingerprint used by completePathToVictory to detect office changes
    // between silver runs (triggers stale data reset)
    const officeFingerprint = this.buildOfficeFingerprint(officeContext)

    const hasTurnout =
      !!pathToVictoryResponse.counts.projectedTurnout &&
      pathToVictoryResponse.counts.projectedTurnout > 0
    const hasDistrict =
      !!pathToVictoryResponse.electionType &&
      !!pathToVictoryResponse.electionLocation

    let statusOverride: P2VStatus | undefined

    // --- Branch 1: Full success — district + turnout found ---
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
      // --- Branch 2: Partial match — district found, no turnout ---
    } else if (hasDistrict) {
      statusOverride = P2VStatus.districtMatched
      await this.slackService.formattedMessage({
        message:
          candidateSlackMessage +
          pathToVictorySlackMessage +
          '\nDistrict matched but no projected turnout available.',
        channel: SlackChannel.botPathToVictoryIssues,
      })
      // --- Branch 3: Total failure — no district, no turnout ---
    } else {
      statusOverride = P2VStatus.failed
      const debugMessage =
        'No Path To Victory Found with projected turnout.\n' +
        (pathToVictoryResponse
          ? 'pathToVictoryResponse: ' + JSON.stringify(pathToVictoryResponse)
          : '')
      await this.slackService.formattedMessage({
        message: candidateSlackMessage + debugMessage,
        channel: SlackChannel.botPathToVictoryIssues,
      })
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
    }

    // Push status to CRM for partial/failed outcomes (not for full success —
    // completePathToVictory handles CRM updates when turnout is found)
    if (statusOverride) {
      await this.crmService.handleUpdateCampaign(
        campaign,
        'path_to_victory_status',
        statusOverride,
      )
    }

    // Only persist results and update the P2V record when silver found turnout.
    // For partial/failed outcomes, skip completePathToVictory so gold's
    // authoritative data (source=ElectionApi, sentinel -1 values, district)
    // is preserved. Returning false causes the queue consumer to call
    // handlePathToVictoryFailure, which tracks p2vAttempts and retries.
    if (hasTurnout) {
      await this.completePathToVictory(campaign.slug, pathToVictoryResponse, {
        p2vStatusOverride: statusOverride,
        officeFingerprint,
      })
    }
    return hasTurnout
  }

  /**
   * Persists silver flow results to the P2V record.
   *
   */
  async completePathToVictory(
    slug: string,
    pathToVictoryResponse: {
      counts: P2VCounts
      electionType: string
      electionLocation: string
    },
    options?: {
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
      const existingHasDistrict =
        !!p2vData.electionType && !!p2vData.electionLocation

      // --- Determine final p2vStatus with rank protection ---
      // Status can only move up (Failed > Waiting > DistrictMatched > Complete),
      // never down. This prevents a failing silver run from overwriting a
      // better status set by gold or a prior silver run.
      const STATUS_RANK: Record<string, number> = {
        [P2VStatus.failed]: 0,
        [P2VStatus.waiting]: 1,
        [P2VStatus.districtMatched]: 2,
        [P2VStatus.complete]: 3,
      }
      const proposedStatus: P2VStatus =
        options?.p2vStatusOverride ??
        (pathToVictoryResponse?.counts?.projectedTurnout &&
        pathToVictoryResponse.counts.projectedTurnout > 0
          ? P2VStatus.complete
          : P2VStatus.waiting)
      const rankOfExisting =
        existingStatus != null ? (STATUS_RANK[existingStatus] ?? 0) : 0
      const rankOfProposed = STATUS_RANK[proposedStatus] ?? 0
      const noDowngrade = !existingStatus || rankOfExisting <= rankOfProposed
      let p2vStatus: P2VStatus = noDowngrade
        ? proposedStatus
        : (existingStatus ?? proposedStatus)

      // Race condition guard: if gold already wrote district data but
      // createPathToVictory reset status to Waiting, infer DistrictMatched
      if (
        existingHasDistrict &&
        (STATUS_RANK[p2vStatus] ?? 0) <
          (STATUS_RANK[P2VStatus.districtMatched] ?? 0)
      ) {
        p2vStatus = P2VStatus.districtMatched
      }

      // --- Detect office change via fingerprint ---
      // When the candidate switches offices between silver runs, strip stale
      // turnout/viability/attempts so old data doesn't persist for the new office.
      // District data (electionType/electionLocation) is kept — gold may have
      // already written correct district data for the new office.
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

      let baseData: Partial<PrismaJson.PathToVictoryData>
      if (hasOfficeChanged) {
        // Strip stale fields but keep district and other metadata
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

      // --- Selective overwrite logic ---
      // Only overwrite district/turnout when incoming data is meaningful.
      // This prevents a failing silver run from wiping out gold's data.
      // Turnout: overwrite when non-zero (real data or sentinel -1), or when
      // office changed (stale turnout already stripped from baseData).
      // District: overwrite only when incoming has non-empty values.
      const incomingTurnout = Number(
        pathToVictoryResponse.counts?.projectedTurnout ?? 0,
      )
      const incomingHasDistrict =
        !!pathToVictoryResponse.electionType &&
        !!pathToVictoryResponse.electionLocation
      const shouldOverwriteDistrict = incomingHasDistrict
      const shouldOverwriteTurnout = incomingTurnout !== 0 || hasOfficeChanged

      const turnoutFields = shouldOverwriteTurnout
        ? {
            projectedTurnout: incomingTurnout,
            winNumber: Number(pathToVictoryResponse.counts?.winNumber ?? 0),
            voterContactGoal: Number(
              pathToVictoryResponse.counts?.voterContactGoal ?? 0,
            ),
          }
        : {}
      const districtFields = shouldOverwriteDistrict
        ? {
            electionType: pathToVictoryResponse.electionType,
            electionLocation: pathToVictoryResponse.electionLocation,
          }
        : {}

      // Merge: existing data ← selective overwrites ← metadata
      const p2vUpdateData: PrismaJson.PathToVictoryData = {
        ...baseData,
        ...turnoutFields,
        ...districtFields,
        ...(hasOfficeChanged ? { p2vAttempts: 0 } : {}),
        p2vCompleteDate: formatDate(new Date(), DateFormats.isoDate),
        p2vStatus,
        source: P2VSource.GpApi,
        ...(options?.officeFingerprint
          ? { officeContextFingerprint: options.officeFingerprint }
          : {}),
      }

      await this.prisma.pathToVictory.update({
        where: { id: p2v.id },
        data: { data: p2vUpdateData },
      })

      await this.analytics.identify(campaign.userId, {
        winNumber: pathToVictoryResponse.counts.winNumber,
      })

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

}

export interface P2VResponse {
  slug: string
  pathToVictoryResponse: PathToVictoryResponse
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any
}
