import { Injectable, Logger } from '@nestjs/common'
import { Campaign } from '@prisma/client'
import {
  AiCampaignManagerService,
  StartCampaignPlanRequest,
} from './aiCampaignManager.service'
import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'

@Injectable()
export class AiCampaignManagerIntegrationService {
  private readonly logger = new Logger(AiCampaignManagerIntegrationService.name)

  constructor(private readonly aiCampaignManager: AiCampaignManagerService) {}

  async generateCampaignTasks(campaign: Campaign): Promise<CampaignTask[]> {
    try {
      // Build request from campaign data
      const request = this.buildCampaignPlanRequest(campaign)

      // Start campaign plan generation
      const session =
        await this.aiCampaignManager.startCampaignPlanGeneration(request)
      this.logger.log(
        `Started campaign plan generation with session ID: ${session.session_id}`,
      )

      // Wait for completion
      const completedProgress = await this.aiCampaignManager.waitForCompletion(
        session.session_id,
      )
      this.logger.log(
        `Campaign plan generation completed for session: ${session.session_id}`,
      )

      // Download the JSON result
      const campaignPlanJson = await this.aiCampaignManager.downloadJson(
        session.session_id,
      )

      // Parse and convert to CampaignTask format
      return this.parseCampaignPlanToTasks(campaignPlanJson, campaign.id)
    } catch (error) {
      this.logger.error('Failed to generate campaign tasks', error)
      throw error
    }
  }

  private buildCampaignPlanRequest(
    campaign: Campaign,
  ): StartCampaignPlanRequest {
    const { details, data } = campaign

    return {
      candidate_name: data.name || `Campaign ${campaign.id}`,
      office: details.office || details.normalizedOffice || 'Local Office',
      state: details.state || 'Unknown',
      party: details.party,
      district: details.district,
      election_date:
        details.electionDate || new Date().toISOString().split('T')[0],
      budget: this.extractBudgetFromData(data),
      experience: details.pastExperience
        ? typeof details.pastExperience === 'string'
          ? details.pastExperience
          : JSON.stringify(details.pastExperience)
        : undefined,
      key_issues: this.extractKeyIssues(details),
      target_demographics: this.extractTargetDemographics(details),
      campaign_goals: this.extractCampaignGoals(data),
    }
  }

  private extractBudgetFromData(data: unknown): number | undefined {
    // Try to extract budget information from campaign data
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
    // Extract demographic information if available
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
    // Extract campaign goals from data if available
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
    campaignPlanJson: unknown,
    campaignId: number,
  ): CampaignTask[] {
    // TODO: Parse the actual JSON structure from the AI service
    // For now, return a basic structure that can be extended
    // when we know the exact JSON format returned by the AI service

    if (!campaignPlanJson || typeof campaignPlanJson !== 'object') {
      this.logger.warn('Invalid campaign plan JSON received')
      return []
    }

    const tasks: CampaignTask[] = []

    // Try to extract tasks from the JSON structure
    // This is a placeholder implementation that should be updated
    // based on the actual JSON structure from the AI service
    if (
      'tasks' in campaignPlanJson &&
      Array.isArray((campaignPlanJson as { tasks: unknown }).tasks)
    ) {
      const jsonTasks = (campaignPlanJson as { tasks: unknown[] }).tasks

      jsonTasks.forEach((task, index) => {
        if (typeof task === 'object' && task) {
          tasks.push(
            this.convertJsonTaskToCampaignTask(task, campaignId, index + 1),
          )
        }
      })
    } else {
      // If no tasks structure found, create some default tasks
      this.logger.warn(
        'No tasks found in campaign plan JSON, creating default tasks',
      )
      tasks.push(...this.createDefaultTasks(campaignId))
    }

    return tasks
  }

  private convertJsonTaskToCampaignTask(
    jsonTask: object,
    campaignId: number,
    weekNumber: number,
  ): CampaignTask {
    const taskObj = jsonTask as Record<string, unknown>

    return {
      id: `ai-generated-${campaignId}-${Date.now()}-${weekNumber}`,
      title: String(taskObj.title || 'AI Generated Task'),
      description: String(
        taskObj.description || 'Task generated by AI Campaign Manager',
      ),
      cta: String(taskObj.cta || 'Get started'),
      flowType: this.mapToFlowType(taskObj.type || taskObj.flowType),
      week: typeof taskObj.week === 'number' ? taskObj.week : weekNumber,
      link: typeof taskObj.link === 'string' ? taskObj.link : undefined,
      proRequired: Boolean(taskObj.proRequired),
      deadline:
        typeof taskObj.deadline === 'number' ? taskObj.deadline : undefined,
      defaultAiTemplateId:
        typeof taskObj.defaultAiTemplateId === 'string'
          ? taskObj.defaultAiTemplateId
          : undefined,
    }
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
        week: 9,
        proRequired: false,
      },
      {
        id: `default-${campaignId}-social`,
        title: 'Create social media presence',
        description: 'Establish your campaign on social media platforms',
        cta: 'Create posts',
        flowType: CampaignTaskType.socialMedia,
        week: 8,
        proRequired: false,
      },
    ]
  }
}
