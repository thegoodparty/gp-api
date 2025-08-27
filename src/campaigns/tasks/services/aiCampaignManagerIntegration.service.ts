import { Injectable, Logger } from '@nestjs/common'
import { Campaign, PathToVictory } from '@prisma/client'
import { createHash } from 'crypto'
import { AiCampaignManagerService } from './aiCampaignManager.service'
import {
  StartCampaignPlanRequest,
  CampaignPlanResponse,
  CampaignPlanTask,
} from '../aiCampaignManager.types'
import { CampaignTask, CampaignTaskType } from '../campaignTasks.types'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

const CAMPAIGN_PLAN_VERSION = process.env.CAMPAIGN_PLAN_VERSION || 1

type CampaignWithPathToVictory = Campaign & {
  pathToVictory?: PathToVictory | null
  details: PrismaJson.CampaignDetails
  data: PrismaJson.CampaignData
}

@Injectable()
export class AiCampaignManagerIntegrationService extends createPrismaBase(
  MODELS.CampaignPlan,
) {
  readonly logger = new Logger(AiCampaignManagerIntegrationService.name)

  constructor(private readonly aiCampaignManager: AiCampaignManagerService) {
    super()
  }

  async generateCampaignTasks(
    campaign: CampaignWithPathToVictory,
  ): Promise<CampaignTask[]> {
    try {
      const request = this.buildCampaignPlanRequest(campaign)
      const existingTasks = await this.checkForExistingPlanVersion(
        campaign,
        request,
      )
      if (existingTasks) {
        return existingTasks
      }
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

      await this.saveCampaignPlan(campaignPlanJson, campaign, request)

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

    const pathData = pathToVictory?.data as
      | PrismaJson.PathToVictoryData
      | undefined
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

  private extractNumberValue(
    value: string | number | undefined,
    defaultValue: number,
  ): number {
    if (typeof value === 'number') return value
    if (typeof value === 'string') {
      const parsed = parseFloat(value)
      return isNaN(parsed) ? defaultValue : parsed
    }
    return defaultValue
  }

  private determineRaceType(details: PrismaJson.CampaignDetails): string {
    if (details.partisanType && typeof details.partisanType === 'string') {
      return details.partisanType.toLowerCase() === 'nonpartisan'
        ? 'Nonpartisan'
        : 'Partisan'
    }
    return 'Nonpartisan'
  }

  private determineIncumbentStatus(
    _details: PrismaJson.CampaignDetails,
  ): string {
    return 'N/A'
  }

  private extractNumberOfOpponents(
    details: PrismaJson.CampaignDetails,
  ): number {
    if (details.runningAgainst && Array.isArray(details.runningAgainst)) {
      return details.runningAgainst.length
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

    if (
      details.runningAgainst &&
      Array.isArray(details.runningAgainst) &&
      details.runningAgainst.length > 0
    ) {
      const opponents = details.runningAgainst
        .map((opponent) => {
          return `${opponent.name || 'Unknown'} (${opponent.party || 'Unknown Party'})`
        })
        .join(', ')
      contextParts.push(`Opponents: ${opponents}`)
    }

    return contextParts.join('; ')
  }

  private async checkForExistingPlanVersion(
    campaign: CampaignWithPathToVictory,
    request: StartCampaignPlanRequest,
  ): Promise<CampaignTask[] | null> {
    const currentHash = this.generateCampaignInfoHashFromRequest(request)

    const existingPlan = await this.model.findUnique({
      where: { campaignId: campaign.id },
    })

    if (existingPlan && existingPlan.campaignInfoHash === currentHash) {
      this.logger.log(
        `Campaign plan unchanged for campaign ${campaign.id}, returning existing tasks`,
      )
      return this.parseCampaignPlanToTasks(
        existingPlan.rawJson as CampaignPlanResponse,
        campaign,
      )
    }

    return null
  }

  private extractBudgetFromData(
    data: PrismaJson.CampaignData,
  ): number | undefined {
    if (
      data.reportedVoterGoals &&
      typeof data.reportedVoterGoals === 'object'
    ) {
      const goals = data.reportedVoterGoals as Record<string, unknown>
      const budget = goals.budget
      if (typeof budget === 'number') return budget
      if (typeof budget === 'string') {
        const parsed = parseFloat(budget)
        return isNaN(parsed) ? undefined : parsed
      }
    }
    return undefined
  }

  private extractKeyIssues(
    details: PrismaJson.CampaignDetails,
  ): string[] | undefined {
    if (details.customIssues && Array.isArray(details.customIssues)) {
      return details.customIssues
        .map((issue) => issue.title)
        .filter((title): title is string => Boolean(title))
    }
    return undefined
  }

  private extractTargetDemographics(
    details: PrismaJson.CampaignDetails,
  ): string[] | undefined {
    const demographics: string[] = []

    if (details.city && typeof details.city === 'string') {
      demographics.push(`City: ${details.city}`)
    }
    if (details.county && typeof details.county === 'string') {
      demographics.push(`County: ${details.county}`)
    }
    if (details.level && typeof details.level === 'string') {
      demographics.push(`Level: ${details.level}`)
    }

    return demographics.length > 0 ? demographics : undefined
  }

  private extractCampaignGoals(
    data: PrismaJson.CampaignData,
  ): string[] | undefined {
    if (
      data.reportedVoterGoals &&
      typeof data.reportedVoterGoals === 'object'
    ) {
      return Object.entries(data.reportedVoterGoals)
        .map(([key, value]) => `${key}: ${value}`)
        .filter(Boolean)
    }
    return undefined
  }

  private parseCampaignPlanToTasks(
    campaignPlanJson: CampaignPlanResponse,
    campaign: CampaignWithPathToVictory,
  ): CampaignTask[] {
    const tasks: CampaignTask[] = []

    if (campaignPlanJson.ai_tasks?.length > 0) {
      campaignPlanJson.ai_tasks.forEach((task, index) => {
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
    const weekNumber =
      jsonTask.week || this.calculateWeekFromDate(jsonTask.date, campaign)

    return {
      id: `ai-generated-${campaign.id}-${index}-${Date.now()}`,
      title: jsonTask.title || 'AI Generated Task',
      description:
        jsonTask.description || 'Task generated by AI Campaign Manager',
      cta: jsonTask.cta || 'Get started',
      flowType: this.mapFlowTypeToValidEnum(jsonTask.flowType),
      week: weekNumber,
      date: jsonTask.date || undefined,
      link: undefined,
      proRequired: jsonTask.proRequired || false,
      deadline: jsonTask.deadline || undefined,
      defaultAiTemplateId: jsonTask.defaultAiTemplateId || undefined,
    }
  }

  private mapFlowTypeToValidEnum(category: string): CampaignTaskType {
    const flowTypeMap: Record<string, CampaignTaskType> = {
      text: CampaignTaskType.text,
      robocall: CampaignTaskType.robocall,
      doorKnocking: CampaignTaskType.doorKnocking,
      phoneBanking: CampaignTaskType.phoneBanking,
      socialMedia: CampaignTaskType.socialMedia,
      events: CampaignTaskType.events,
      education: CampaignTaskType.education,
      compliance: CampaignTaskType.compliance,
      // Map invalid values to valid ones
      general: CampaignTaskType.education,
    }

    return flowTypeMap[category] || CampaignTaskType.education
  }

  private calculateWeekFromDate(
    dateStr: string,
    campaign: CampaignWithPathToVictory,
  ): number {
    if (!dateStr) return 1

    try {
      const taskDate = new Date(dateStr)
      const electionDateStr = campaign.details.electionDate

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

  private generateCampaignInfoHashFromRequest(
    request: StartCampaignPlanRequest,
  ): string {
    const campaignInfo = {
      campaign_plan_version: CAMPAIGN_PLAN_VERSION,
      candidate_name: request.candidate_name,
      election_date: request.election_date,
      office_and_jurisdiction: request.office_and_jurisdiction,
      race_type: request.race_type,
      incumbent_status: request.incumbent_status,
      seats_available: request.seats_available,
      number_of_opponents: request.number_of_opponents,
      win_number: request.win_number,
      total_likely_voters: request.total_likely_voters,
      available_cell_phones: request.available_cell_phones,
      available_landlines: request.available_landlines,
      primary_date: request.primary_date,
      additional_race_context: request.additional_race_context,
    }
    return this.generateCampaignInfoHash(campaignInfo)
  }

  private generateCampaignInfoHash(
    campaignInfo: Record<string, string | number | boolean | null | undefined>,
  ): string {
    const { generated_date: _generated_date, ...campaignInfoWithoutDate } =
      campaignInfo
    const sortedInfo = Object.keys(campaignInfoWithoutDate)
      .sort()
      .reduce(
        (result, key) => {
          result[key] = campaignInfoWithoutDate[key]
          return result
        },
        {} as Record<string, string | number | boolean | null | undefined>,
      )

    const hashString = JSON.stringify(sortedInfo)
    return createHash('sha256').update(hashString).digest('hex')
  }

  private async saveCampaignPlan(
    campaignPlanJson: CampaignPlanResponse,
    campaign: CampaignWithPathToVictory,
    request: StartCampaignPlanRequest,
  ): Promise<void> {
    const planData = campaignPlanJson
    const campaignInfoHash = this.generateCampaignInfoHashFromRequest(request)

    const campaignPlanData = {
      campaignId: campaign.id,
      campaignInfoHash,
      plan: planData.campaign_plan,
      rawJson: planData,
    }

    try {
      const existingPlan = await this.model.findUnique({
        where: { campaignId: campaign.id },
      })

      if (existingPlan) {
        await this.model.delete({
          where: { campaignId: campaign.id },
        })
      }

      await this.model.create({
        data: campaignPlanData,
      })

      this.logger.log(
        `Campaign plan saved for campaign ${campaign.id} with hash ${campaignInfoHash}`,
      )
    } catch (error) {
      this.logger.error('Failed to save campaign plan', error)
      throw error
    }
  }
}
