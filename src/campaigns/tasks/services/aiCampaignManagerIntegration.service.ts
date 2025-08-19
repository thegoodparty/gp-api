import { Injectable, Logger } from '@nestjs/common'
import { Campaign, PathToVictory } from '@prisma/client'
import { AiCampaignManagerService } from './aiCampaignManager.service'
import {
  StartCampaignPlanRequest,
  CampaignPlanResponse,
  CampaignPlanTask,
} from '../aiCampaignManager.types'
import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

type CampaignWithPathToVictory = Campaign & {
  pathToVictory?: PathToVictory | null
}

@Injectable()
export class AiCampaignManagerIntegrationService {
  private readonly logger = new Logger(AiCampaignManagerIntegrationService.name)

  constructor(private readonly aiCampaignManager: AiCampaignManagerService) {}

  async generateCampaignTasks(
    campaign: CampaignWithPathToVictory,
  ): Promise<CampaignTask[]> {
    try {
      const request = this.buildCampaignPlanRequest(campaign)

      const session =
        await this.aiCampaignManager.startCampaignPlanGeneration(request)
      this.logger.log(
        `Started campaign plan generation with session ID: ${session.session_id}`,
      )

      await this.aiCampaignManager.waitForCompletion(session.session_id)
      this.logger.log(
        `Campaign plan generation completed for session: ${session.session_id}`,
      )

      const campaignPlanJson = await this.aiCampaignManager.downloadJson(
        session.session_id,
      )

      return this.parseCampaignPlanToTasks(campaignPlanJson, campaign)
    } catch (error) {
      this.logger.error('Failed to generate campaign tasks', error)
      throw error
    }
  }

  private buildCampaignPlanRequest(
    campaign: CampaignWithPathToVictory,
  ): StartCampaignPlanRequest {
    const { details, data, pathToVictory } = campaign

    const office = details.office || details.normalizedOffice || 'Local Office'
    const jurisdiction = details.state || 'Unknown State'
    const district = details.district ? ` - ${details.district}` : ''
    const office_and_jurisdiction = `${office} in ${jurisdiction}${district}`

    const pathData = pathToVictory?.data as Record<string, unknown> | undefined
    const winNumber = this.extractNumberValue(pathData?.winNumber, 1000)
    const totalRegisteredVoters = this.extractNumberValue(
      pathData?.totalRegisteredVoters,
      5000,
    )
    const projectedTurnout = this.extractNumberValue(
      pathData?.projectedTurnout,
      totalRegisteredVoters * 0.6,
    )

    const additionalContext = this.buildAdditionalRaceContext(campaign)

    return {
      candidate_name: data.name || `Campaign ${campaign.id}`,
      election_date:
        details.electionDate || new Date().toISOString().split('T')[0],
      office_and_jurisdiction,
      race_type: this.determineRaceType(details),
      incumbent_status: this.determineIncumbentStatus(details),
      seats_available: 1,
      number_of_opponents: this.extractNumberOfOpponents(details),
      win_number: winNumber,
      total_likely_voters: Math.floor(projectedTurnout),
      available_cell_phones: Math.floor(projectedTurnout * 0.7),
      available_landlines: Math.floor(projectedTurnout * 0.3),
      primary_date: details.primaryElectionDate || null,
      additional_race_context: additionalContext,
    }
  }

  private extractNumberValue(value: unknown, defaultValue: number): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return isNaN(parsed) ? defaultValue : parsed
    }
    return defaultValue
  }

  private determineRaceType(details: unknown): string {
    if (typeof details === 'object' && details && 'partisanType' in details) {
      const partisanType = (details as { partisanType?: unknown }).partisanType
      if (typeof partisanType === 'string') {
        return partisanType.toLowerCase() === 'nonpartisan'
          ? 'Nonpartisan'
          : 'Partisan'
      }
    }
    return 'Nonpartisan'
  }

  private determineIncumbentStatus(_details: unknown): string {
    return 'N/A'
  }

  private extractNumberOfOpponents(details: unknown): number {
    if (typeof details === 'object' && details && 'runningAgainst' in details) {
      const runningAgainst = (details as { runningAgainst?: unknown })
        .runningAgainst
      if (Array.isArray(runningAgainst)) {
        return runningAgainst.length
      }
    }
    return 1
  }

  private buildAdditionalRaceContext(
    campaign: CampaignWithPathToVictory,
  ): string {
    const { details, data } = campaign
    const contextParts: string[] = []

    if (details.party) {
      const party =
        details.party === 'Other' ? details.otherParty : details.party
      contextParts.push(`Party: ${party}`)
    }

    if (details.pastExperience) {
      const experience =
        typeof details.pastExperience === 'string'
          ? details.pastExperience
          : JSON.stringify(details.pastExperience)
      contextParts.push(`Experience: ${experience}`)
    }

    if (details.occupation) {
      contextParts.push(`Occupation: ${details.occupation}`)
    }

    const keyIssues = this.extractKeyIssues(details)
    if (keyIssues && keyIssues.length > 0) {
      contextParts.push(`Key Issues: ${keyIssues.join(', ')}`)
    }

    const campaignGoals = this.extractCampaignGoals(data)
    if (campaignGoals && campaignGoals.length > 0) {
      contextParts.push(`Campaign Goals: ${campaignGoals.join(', ')}`)
    }

    const demographics = this.extractTargetDemographics(details)
    if (demographics && demographics.length > 0) {
      contextParts.push(`Demographics: ${demographics.join(', ')}`)
    }

    const budget = this.extractBudgetFromData(data)
    if (budget) {
      contextParts.push(`Budget: $${budget}`)
    }

    if (typeof details === 'object' && details && 'runningAgainst' in details) {
      const runningAgainst = (details as { runningAgainst?: unknown })
        .runningAgainst
      if (Array.isArray(runningAgainst) && runningAgainst.length > 0) {
        const opponents = runningAgainst
          .map((opponent) => {
            if (typeof opponent === 'object' && opponent) {
              const opp = opponent as Record<string, unknown>
              return `${opp.name || 'Unknown'} (${opp.party || 'Unknown Party'})`
            }
            return String(opponent)
          })
          .join(', ')
        contextParts.push(`Opponents: ${opponents}`)
      }
    }

    return contextParts.join('; ')
  }

  private extractBudgetFromData(data: unknown): number | undefined {
    if (typeof data === 'object' && data && 'budget' in data) {
      const budget = (data as { budget?: unknown }).budget
      if (typeof budget === 'number') return budget
      if (typeof budget === 'string') {
        const parsed = parseFloat(budget)
        return isNaN(parsed) ? undefined : parsed
      }
    }
    return undefined
  }

  private extractKeyIssues(details: unknown): string[] | undefined {
    if (typeof details === 'object' && details && 'customIssues' in details) {
      const customIssues = (details as { customIssues?: unknown }).customIssues
      if (Array.isArray(customIssues)) {
        return customIssues
          .map((issue) =>
            typeof issue === 'object' && issue && 'title' in issue
              ? String((issue as { title: unknown }).title)
              : undefined,
          )
          .filter((title): title is string => Boolean(title))
      }
    }
    return undefined
  }

  private extractTargetDemographics(details: unknown): string[] | undefined {
    const demographics: string[] = []

    if (typeof details === 'object' && details) {
      const detailsObj = details as Record<string, unknown>

      if (detailsObj.city && typeof detailsObj.city === 'string') {
        demographics.push(`City: ${detailsObj.city}`)
      }
      if (detailsObj.county && typeof detailsObj.county === 'string') {
        demographics.push(`County: ${detailsObj.county}`)
      }
      if (detailsObj.level && typeof detailsObj.level === 'string') {
        demographics.push(`Level: ${detailsObj.level}`)
      }
    }

    return demographics.length > 0 ? demographics : undefined
  }

  private extractCampaignGoals(data: unknown): string[] | undefined {
    if (typeof data === 'object' && data && 'reportedVoterGoals' in data) {
      const goals = (data as { reportedVoterGoals?: unknown })
        .reportedVoterGoals
      if (typeof goals === 'object' && goals) {
        return Object.entries(goals)
          .map(([key, value]) => `${key}: ${value}`)
          .filter(Boolean)
      }
    }
    return undefined
  }

  private parseCampaignPlanToTasks(
    campaignPlanJson: CampaignPlanResponse,
    campaign: CampaignWithPathToVictory,
  ): CampaignTask[] {
    const tasks: CampaignTask[] = []

    if (campaignPlanJson.tasks?.all_tasks?.length > 0) {
      campaignPlanJson.tasks.all_tasks.forEach((task, index) => {
        tasks.push(
          this.convertJsonTaskToCampaignTask(task, campaign, index + 1),
        )
      })
    } else {
      this.logger.warn(
        'No tasks found in campaign plan JSON, creating default tasks',
      )
      tasks.push(...this.createDefaultTasks(campaign.id))
    }

    return tasks
  }

  private convertJsonTaskToCampaignTask(
    jsonTask: CampaignPlanTask,
    campaign: CampaignWithPathToVictory,
    index: number,
  ): CampaignTask {
    const weekNumber = this.calculateWeekFromDate(jsonTask.date, campaign)

    return {
      id: `ai-generated-${campaign.id}-${index}-${Date.now()}`,
      title: jsonTask.title || 'AI Generated Task',
      description:
        jsonTask.description || 'Task generated by AI Campaign Manager',
      cta: this.generateCta(jsonTask.type),
      flowType: this.mapToFlowType(jsonTask.type),
      week: weekNumber,
      link: undefined,
      proRequired: false,
      deadline: undefined,
      defaultAiTemplateId: undefined,
    }
  }

  private calculateWeekFromDate(
    dateStr: string,
    campaign: CampaignWithPathToVictory,
  ): number {
    if (!dateStr) return 1

    try {
      const taskDate = new Date(dateStr)
      const { electionDate: electionDateStr } = campaign.details

      if (!electionDateStr) return 1

      const electionDate = new Date(electionDateStr)
      const diffWeeks = Math.ceil(
        (electionDate.getTime() - taskDate.getTime()) /
          (1000 * 60 * 60 * 24 * 7),
      )
      return Math.max(1, diffWeeks)
    } catch {
      return 1
    }
  }

  private generateCta(taskType: unknown): string {
    const type = String(taskType || '').toLowerCase()

    if (type.includes('text')) return 'Send text'
    if (type.includes('robocall') || type.includes('call')) return 'Make calls'
    if (
      type.includes('market') ||
      type.includes('fair') ||
      type.includes('event')
    )
      return 'Attend event'
    if (type.includes('forum') || type.includes('meeting'))
      return 'Join meeting'
    if (type.includes('volunteer')) return 'Volunteer'
    if (type.includes('deadline')) return 'Check deadline'

    return 'Get started'
  }

  private mapToFlowType(type: unknown): CampaignTaskType {
    if (typeof type === 'string') {
      const normalizedType = type.toLowerCase()

      switch (normalizedType) {
        case 'text':
        case 'texting':
        case 'sms':
          return CampaignTaskType.text
        case 'robocall':
        case 'call':
        case 'calling':
          return CampaignTaskType.robocall
        case 'doorknocking':
        case 'door':
        case 'canvassing':
          return CampaignTaskType.doorKnocking
        case 'phonebanking':
        case 'phone':
          return CampaignTaskType.phoneBanking
        case 'socialmedia':
        case 'social':
        case 'facebook':
        case 'twitter':
          return CampaignTaskType.socialMedia
        case 'events':
        case 'event':
          return CampaignTaskType.events
        case 'education':
        case 'learn':
        case 'training':
          return CampaignTaskType.education
        default:
          return CampaignTaskType.education
      }
    }

    return CampaignTaskType.education
  }

  private createDefaultTasks(campaignId: number): CampaignTask[] {
    return [
      {
        id: `default-${campaignId}-setup`,
        title: 'Set up your campaign foundation',
        description: 'Complete your campaign profile and basic setup',
        cta: 'Get started',
        flowType: CampaignTaskType.education,
        week: 12,
        proRequired: false,
      },
      {
        id: `default-${campaignId}-social`,
        title: 'Create social media presence',
        description: 'Establish your campaign on social media platforms',
        cta: 'Create posts',
        flowType: CampaignTaskType.socialMedia,
        week: 10,
        proRequired: false,
      },
    ]
  }
}
