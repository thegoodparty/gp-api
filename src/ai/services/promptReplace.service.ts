import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { subDays } from 'date-fns'
import { PinoLogger } from 'nestjs-pino'
import { OrganizationsService } from '@/organizations/services/organizations.service'
import { RaceTargetMetrics } from '@/elections/types/elections.types'
import { getUserFullName } from 'src/users/util/users.util'
import {
  againstToStr,
  positionsToStr,
  replaceAll,
} from '../util/aiContent.util'

type PromptReplacement = {
  find: string
  replace: string | boolean | number | undefined | null
}

export type PromptReplaceCampaign = Prisma.CampaignGetPayload<{
  include: {
    campaignPositions: {
      include: {
        topIssue: true
        position: true
      }
    }
    campaignUpdateHistory: true
    user: true
  }
}>

@Injectable()
export class PromptReplaceService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PromptReplaceService.name)
  }

  /** Replace placeholder tokens in AI content prompt */
  async promptReplace(
    prompt: string,
    campaign: PromptReplaceCampaign,
    liveMetrics?: RaceTargetMetrics | null,
  ) {
    try {
      if (!campaign.user) {
        throw new Error('Campaign has no associated user')
      }

      const replacements: PromptReplacement[] = [
        ...this.buildCampaignReplacements(campaign),
        ...(await this.buildOfficeReplacement(campaign)),
        ...this.buildLiveMetricsReplacements(liveMetrics),
        ...this.buildUpdateHistoryReplacement(prompt, campaign),
        ...this.buildAiContentReplacements(campaign),
      ]

      let result = prompt
      for (const { find, replace } of replacements) {
        try {
          result = replaceAll(
            result,
            find,
            replace ? replace.toString().trim() : '',
          )
        } catch (e) {
          this.logger.error({ e }, 'error at prompt replace')
        }
      }

      return result + '\n\n      '
    } catch (e) {
      this.logger.error({ e }, 'Error in helpers/ai/promptReplace')
      return ''
    }
  }

  private buildCampaignReplacements(
    campaign: PromptReplaceCampaign,
  ): PromptReplacement[] {
    const user = campaign.user!
    const details = campaign.details
    const name = getUserFullName(user)
    const positionsStr = positionsToStr(
      campaign.campaignPositions,
      details.customIssues,
    )

    let party = details.party === 'Other' ? details.otherParty : details?.party
    if (party === 'Independent') {
      party = 'Independent / non-partisan'
    }

    return [
      { find: 'name', replace: name },
      { find: 'zip', replace: details.zip },
      { find: 'website', replace: details.website },
      { find: 'party', replace: party },
      { find: 'state', replace: details.state },
      { find: 'primaryElectionDate', replace: details.primaryElectionDate },
      { find: 'district', replace: details.district },
      { find: 'positions', replace: positionsStr },
      {
        find: 'pastExperience',
        replace:
          typeof details.pastExperience === 'string'
            ? details.pastExperience
            : JSON.stringify(details.pastExperience || {}),
      },
      { find: 'occupation', replace: details.occupation },
      { find: 'funFact', replace: details.funFact },
      {
        find: 'campaignCommittee',
        replace: details.campaignCommittee || 'unknown',
      },
      {
        find: 'runningAgainst',
        replace: againstToStr(details.runningAgainst),
      },
      { find: 'electionDate', replace: details.electionDate },
      { find: 'statementName', replace: details.statementName },
    ]
  }

  private async buildOfficeReplacement(
    campaign: PromptReplaceCampaign,
  ): Promise<PromptReplacement[]> {
    const positionName = campaign.organizationSlug
      ? await this.organizations.resolvePositionNameByOrganizationSlug(
          campaign.organizationSlug,
        )
      : null

    const office =
      positionName && campaign.details.district
        ? `${positionName} in ${campaign.details.district}`
        : positionName || ''

    return [{ find: 'office', replace: office }]
  }

  private buildLiveMetricsReplacements(
    liveMetrics?: RaceTargetMetrics | null,
  ): PromptReplacement[] {
    if (!liveMetrics) return []

    return [
      { find: 'projectedTurnout', replace: liveMetrics.projectedTurnout },
      { find: 'winNumber', replace: liveMetrics.winNumber },
      { find: 'voteGoal', replace: liveMetrics.voterContactGoal },
      { find: 'voterContactGoal', replace: liveMetrics.voterContactGoal },
    ]
  }

  private buildUpdateHistoryReplacement(
    prompt: string,
    campaign: PromptReplaceCampaign,
  ): PromptReplacement[] {
    if (!prompt.includes('[[updateHistory]]')) return []

    const updates = campaign.campaignUpdateHistory
    const now = new Date()
    const thisWeek = subDays(now, 7)
    const twoWeeksAgo = subDays(now, 14)

    const emptyBucket = () => ({
      total: 0,
      doorKnocking: 0,
      digitalAds: 0,
      calls: 0,
      yardSigns: 0,
      events: 0,
      text: 0,
      directMail: 0,
    })

    const history = {
      allTime: emptyBucket(),
      thisWeek: emptyBucket(),
      lastWeek: emptyBucket(),
    }

    if (updates) {
      for (const u of updates) {
        history.allTime[u.type] += u.quantity
        history.allTime.total += u.quantity

        if (u.createdAt > thisWeek) {
          history.thisWeek[u.type] += u.quantity
          history.thisWeek.total += u.quantity
        } else if (u.createdAt > twoWeeksAgo) {
          history.lastWeek[u.type] += u.quantity
          history.lastWeek.total += u.quantity
        }
      }
    }

    return [{ find: 'updateHistory', replace: JSON.stringify(history) }]
  }

  private buildAiContentReplacements(
    campaign: PromptReplaceCampaign,
  ): PromptReplacement[] {
    if (!campaign.aiContent) return []

    const {
      aboutMe,
      communicationStrategy,
      messageBox,
      mobilizing,
      policyPlatform,
      slogan,
      why,
    } = campaign.aiContent

    return [
      { find: 'slogan', replace: slogan?.content },
      { find: 'why', replace: why?.content },
      { find: 'about', replace: aboutMe?.content },
      { find: 'myPolicies', replace: policyPlatform?.content },
      { find: 'commStart', replace: communicationStrategy?.content },
      { find: 'mobilizing', replace: mobilizing?.content },
      { find: 'positioning', replace: messageBox?.content },
    ]
  }
}
