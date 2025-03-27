import { forwardRef, Inject, Injectable } from '@nestjs/common'
import { PrismaService } from '../../prisma/prisma.service'
import { VotersService } from '../../voters/services/voters.service'
import { OfficeMatchService } from './officeMatch.service'
import { SlackService } from '../../shared/services/slack.service'
import { EmailService } from '../../email/email.service'
import { CrmCampaignsService } from '../../campaigns/services/crmCampaigns.service'
import { createPrismaBase, MODELS } from '../../prisma/util/prisma.util'
import { Campaign, PathToVictory, Prisma } from '@prisma/client'
import {
  PathToVictoryInput,
  PathToVictoryResponse,
} from '../types/pathToVictory.types'
import { VoterCounts } from 'src/voters/voters.types'
import { EmailTemplateNames } from '../../email/email.types'
import { SlackChannel } from 'src/shared/services/slackService.types'
import { P2VStatus } from '../../elections/types/pathToVictory.types'
import { CampaignCreatedBy } from 'src/campaigns/campaigns.types'

@Injectable()
export class PathToVictoryService extends createPrismaBase(
  MODELS.PathToVictory,
) {
  constructor(
    private prisma: PrismaService,
    private votersService: VotersService,
    private officeMatchService: OfficeMatchService,
    private slackService: SlackService,
    private emailService: EmailService,
    @Inject(forwardRef(() => CrmCampaignsService))
    private crmService: CrmCampaignsService,
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
        total: 0,
        democrat: 0,
        republican: 0,
        independent: 0,
        men: 0,
        women: 0,
        white: 0,
        africanAmerican: 0,
        asian: 0,
        hispanic: 0,
      } as VoterCounts,
    }

    this.logger.debug(`Starting p2v for ${input.slug}`)

    try {
      let searchColumns: string[] = ['']

      if (!input.electionType || !input.electionLocation) {
        if (
          !input.officeName.includes('At Large') &&
          !input.officeName.includes('President of the United States') &&
          !input.officeName.includes('Senate') &&
          !input.officeName.includes('Governor') &&
          !input.officeName.includes('Mayor')
        ) {
          searchColumns = await this.officeMatchService.searchMiscDistricts(
            input.slug,
            input.officeName,
            input.electionLevel,
            input.electionState,
          )
        }

        const locationColumns =
          await this.officeMatchService.searchLocationDistricts(
            input.slug,
            input.electionLevel,
            input.officeName,
            input.subAreaName,
            input.subAreaValue,
          )

        if (locationColumns.length > 0) {
          this.logger.debug('locationColumns', locationColumns)
          searchColumns = searchColumns.concat(locationColumns)
        }
      }

      let attempts = 1
      for (const searchColumn of searchColumns) {
        let electionType = input.electionType
        let electionLocation = input.electionLocation

        if (
          input.electionLevel === 'federal' &&
          (input.officeName.includes('President of the United States') ||
            input.officeName.includes('Senate'))
        ) {
          electionType = ''
          electionLocation = ''
        } else if (input.officeName.includes('Governor')) {
          electionType = ''
          electionLocation = ''
        } else if (electionType && electionLocation) {
          // if already specified, skip the search
        } else {
          await new Promise((resolve) => setTimeout(resolve, 7000))
          const columnResponse = await this.officeMatchService.getSearchColumn(
            input.slug,
            searchColumn,
            input.electionState,
            this.getSearchString(input),
          )

          if (!columnResponse) continue

          electionType = columnResponse.column
          electionLocation = columnResponse.value
        }

        if (!electionType || !electionLocation) continue

        this.logger.debug(
          `Found Column! Election Type: ${electionType}. Location: ${electionLocation}`,
        )

        const state =
          input.officeName === 'President of the United States'
            ? 'US'
            : input.electionState

        const counts = await this.votersService.getVoterCounts(
          input.electionTerm,
          input.electionDate || new Date().toISOString().slice(0, 10),
          state,
          electionType,
          electionLocation,
          input.partisanType,
          input.priorElectionDates,
        )

        if (counts?.total && counts.total > 0) {
          pathToVictoryResponse.electionType = electionType
          pathToVictoryResponse.electionLocation = electionLocation
          pathToVictoryResponse.counts = counts
          break
        }

        if (++attempts > 10) break
      }

      return {
        pathToVictoryResponse,
        ...input,
      }
    } catch (e) {
      this.logger.error('Error in handle-p2v', e)
      await this.slackService.errorMessage({
        message: 'Error in handle-p2v',
        error: e,
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
      counts: VoterCounts
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
    } = p2vResponse

    const candidateSlackMessage = `
    • Candidate: ${campaign?.data?.name} [${campaign?.slug}]
    • Office: ${officeName}
    • Election Date: ${electionDate}
    • Prior Election Dates: ${priorElectionDates}
    • L2 Election Date Columns: ${
      pathToVictoryResponse?.counts?.foundColumns
        ? JSON.stringify(pathToVictoryResponse?.counts?.foundColumns)
        : ''
    }
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
    ￮ L2 Election Type: ${pathToVictoryResponse.electionType}
    ￮ L2 Location: ${pathToVictoryResponse.electionLocation}
    ￮ Total Voters: ${pathToVictoryResponse.counts.total}
    ￮ Democrats: ${pathToVictoryResponse.counts.democrat}
    ￮ Republicans: ${pathToVictoryResponse.counts.republican}
    ￮ Independents: ${pathToVictoryResponse.counts.independent}
    `

    if (
      pathToVictoryResponse?.counts?.total &&
      pathToVictoryResponse.counts.total > 0 &&
      pathToVictoryResponse.counts.projectedTurnout &&
      pathToVictoryResponse.counts.projectedTurnout > 0
    ) {
      const turnoutSlackMessage = `
      ￮ Average Turnout %: ${pathToVictoryResponse.counts.averageTurnoutPercent}
      ￮ Projected Turnout: ${pathToVictoryResponse.counts.projectedTurnout}
      ￮ Projected Turnout %: ${pathToVictoryResponse.counts.projectedTurnoutPercent}
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
        await this.completePathToVictory(
          campaign.slug,
          pathToVictoryResponse,
          false,
        )
        return true
      } else {
        await this.completePathToVictory(campaign.slug, pathToVictoryResponse)
        return true
      }
    } else if (
      pathToVictoryResponse?.electionType &&
      pathToVictoryResponse?.counts?.total &&
      pathToVictoryResponse.counts.total > 0
    ) {
      const debugMessage = 'Was not able to get the turnout numbers.\n'
      await this.slackService.formattedMessage({
        message:
          candidateSlackMessage + pathToVictorySlackMessage + debugMessage,
        channel: SlackChannel.botPathToVictoryIssues,
      })

      if (campaign.pathToVictory?.data?.p2vStatus !== 'Complete') {
        await this.completePathToVictory(
          campaign.slug,
          pathToVictoryResponse,
          false,
        )
        return true
      }
    } else {
      let debugMessage = 'No Path To Victory Found.\n'
      if (pathToVictoryResponse) {
        debugMessage +=
          'pathToVictoryResponse: ' + JSON.stringify(pathToVictoryResponse)
      }
      await this.slackService.formattedMessage({
        message: candidateSlackMessage + debugMessage,
        channel: SlackChannel.botPathToVictoryIssues,
      })
    }

    await this.crmService.handleUpdateCampaign(
      campaign,
      'path_to_victory_status',
      'Waiting',
    )
    return false
  }

  async completePathToVictory(
    slug: string,
    pathToVictoryResponse: {
      counts: VoterCounts
      electionType: string
      electionLocation: string
    },
    sendEmail = true,
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

      let p2vStatus: P2VStatus = P2VStatus.waiting
      if (
        pathToVictoryResponse?.counts?.total &&
        pathToVictoryResponse.counts.total > 0 &&
        pathToVictoryResponse?.counts?.projectedTurnout &&
        pathToVictoryResponse.counts.projectedTurnout > 0
      ) {
        p2vStatus = P2VStatus.complete
      }

      const p2vData = p2v.data || {}
      await this.prisma.pathToVictory.update({
        where: { id: p2v.id },
        data: {
          data: {
            ...p2vData,
            totalRegisteredVoters: pathToVictoryResponse.counts.total,
            republicans: pathToVictoryResponse.counts.republican,
            democrats: pathToVictoryResponse.counts.democrat,
            indies: pathToVictoryResponse.counts.independent,
            women: pathToVictoryResponse.counts.women,
            men: pathToVictoryResponse.counts.men,
            white: pathToVictoryResponse.counts.white,
            asian: pathToVictoryResponse.counts.asian,
            africanAmerican: pathToVictoryResponse.counts.africanAmerican,
            hispanic: pathToVictoryResponse.counts.hispanic,
            averageTurnout: pathToVictoryResponse.counts.averageTurnout,
            projectedTurnout: pathToVictoryResponse.counts.projectedTurnout,
            winNumber: pathToVictoryResponse.counts.winNumber,
            voterContactGoal: pathToVictoryResponse.counts.voterContactGoal,
            electionType: pathToVictoryResponse.electionType,
            electionLocation: pathToVictoryResponse.electionLocation,
            p2vCompleteDate: new Date().toISOString().slice(0, 10),
            p2vStatus,
          },
        },
      })

      if (p2vStatus === 'Complete' && sendEmail && campaign.user?.email) {
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
            template: EmailTemplateNames.candidateVictoryReady,
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
    } catch (e) {
      this.logger.error('error updating campaign', e)
      await this.slackService.errorMessage({
        message: 'error updating campaign with path to victory',
        error: e,
      })
    }
  }

  private async getUserName(user: any): Promise<string> {
    return user.name || 'Friend'
  }
}

export interface P2VResponse {
  slug: string
  pathToVictoryResponse: PathToVictoryResponse
  [key: string]: any
}
