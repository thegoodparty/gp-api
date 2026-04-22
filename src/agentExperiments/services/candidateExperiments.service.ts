import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { Campaign, ElectedOffice, User } from '@prisma/client'
import { PinoLogger } from 'nestjs-pino'
import { CampaignsService } from '@/campaigns/services/campaigns.service'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { ExperimentRunsService } from './experimentRuns.service'
import { AgentDispatchService } from './agentDispatch.service'
import {
  EXPERIMENT_IDS,
  type RequestExperimentDto,
} from '../schemas/agentExperiments.schema'

const EXPERIMENT_MODES: Record<(typeof EXPERIMENT_IDS)[number], 'win' | 'serve'> = {
  voter_targeting: 'win',
  walking_plan: 'win',
  district_intel: 'serve',
  peer_city_benchmarking: 'serve',
  meeting_briefing: 'serve',
}

const ALLOWED_USER_PARAMS: Record<(typeof EXPERIMENT_IDS)[number], string[]> = {
  voter_targeting: [],
  walking_plan: [],
  district_intel: [],
  peer_city_benchmarking: [],
  meeting_briefing: [],
}

type CampaignWithRelations = Campaign & {
  pathToVictory?: { data: PrismaJson.PathToVictoryData } | null
  topIssues?: { name: string }[]
  electedOffices?: Pick<ElectedOffice, 'id' | 'swornInDate'>[]
}

@Injectable()
export class CandidateExperimentsService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly campaigns: CampaignsService,
    private readonly experimentRuns: ExperimentRunsService,
    private readonly dispatchService: AgentDispatchService,
    private readonly s3: S3Service,
  ) {
    this.logger.setContext(CandidateExperimentsService.name)
  }

  async getCampaignForUser(userId: number): Promise<CampaignWithRelations> {
    const campaign = await this.campaigns.findFirst({
      where: { userId },
      include: { pathToVictory: true, topIssues: true, electedOffices: true },
    })
    if (!campaign) {
      throw new NotFoundException('Campaign not found')
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- Prisma include clause guarantees pathToVictory, topIssues, and electedOffices are present
    return campaign as CampaignWithRelations
  }

  async getMyRuns(user: User) {
    const campaign = await this.getCampaignForUser(user.id)
    const organizationSlug = campaign.organizationSlug
    return this.experimentRuns.findMany({
      where: { organizationSlug },
      orderBy: { createdAt: 'desc' },
    })
  }

  async requestExperiment(user: User, body: RequestExperimentDto) {
    const campaign = await this.getCampaignForUser(user.id)
    if (!campaign.details || typeof campaign.details !== 'object') {
      throw new BadRequestException(
        'Campaign details are missing or invalid.',
      )
    }
    const details = campaign.details as PrismaJson.CampaignDetails
    const isImpersonating = (user as User & { impersonating?: boolean })
      .impersonating === true
    if (!details.isAiBetaVip && !isImpersonating) {
      throw new ForbiddenException('Campaign is not enrolled in AI beta')
    }

    const organizationSlug = campaign.organizationSlug
    const existingRun = await this.experimentRuns.findFirst({
      where: {
        organizationSlug,
        experimentId: body.experimentId,
        status: { in: ['PENDING', 'RUNNING'] },
      },
    })
    if (existingRun) {
      throw new BadRequestException('A report is already being generated.')
    }

    const allowedKeys = ALLOWED_USER_PARAMS[body.experimentId] ?? []
    const screenedParams = Object.fromEntries(
      Object.entries(body.params).filter(([key]) => allowedKeys.includes(key)),
    )
    if (Object.keys(body.params).length !== Object.keys(screenedParams).length) {
      const strippedKeys = Object.keys(body.params).filter(
        (k) => !allowedKeys.includes(k),
      )
      this.logger.warn(
        { experimentId: body.experimentId, organizationSlug, strippedKeys },
        'Stripped unknown param keys',
      )
    }

    const screenedBody = { ...body, params: screenedParams }
    const mode = EXPERIMENT_MODES[body.experimentId]

    if (mode === 'serve') {
      const result = await this.dispatchServeExperiment(
        user,
        campaign,
        details,
        screenedBody,
      )

      if (body.experimentId === 'district_intel') {
        await this.experimentRuns.updateMany({
          where: {
            organizationSlug,
            experimentId: {
              in: ['peer_city_benchmarking', 'meeting_briefing'],
            },
            status: 'SUCCESS',
          },
          data: { status: 'STALE' },
        })
      }

      return result
    }
    return this.dispatchWinExperiment(campaign, details, screenedBody)
  }

  async getAvailableExperiments(user: User) {
    const campaign = await this.getCampaignForUser(user.id)
    const hasElectedOffice = (campaign.electedOffices?.length ?? 0) > 0
    const targetMode = hasElectedOffice ? 'serve' : 'win'

    return Object.entries(EXPERIMENT_MODES)
      .filter(([, mode]) => mode === targetMode)
      .map(([id, mode]) => ({ id, mode }))
  }

  async getArtifact(user: User, runId: string) {
    const campaign = await this.getCampaignForUser(user.id)
    const organizationSlug = campaign.organizationSlug

    const run = await this.experimentRuns.findFirst({
      where: { runId },
    })
    if (!run) {
      throw new NotFoundException('Experiment run not found')
    }
    if (run.organizationSlug !== organizationSlug) {
      throw new ForbiddenException(
        'Experiment run does not belong to your campaign',
      )
    }
    if (!run.artifactBucket || !run.artifactKey) {
      throw new NotFoundException('Artifact not available for this run')
    }

    const content = await this.s3.getFile(run.artifactBucket, run.artifactKey)
    if (!content) {
      throw new NotFoundException('Artifact not found in storage')
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      return JSON.parse(content) as Record<string, unknown>
    } catch {
      throw new BadRequestException('Artifact contains invalid JSON')
    }
  }

  private async dispatchWinExperiment(
    campaign: CampaignWithRelations,
    details: PrismaJson.CampaignDetails,
    body: RequestExperimentDto,
  ) {
    const p2vData = campaign.pathToVictory?.data
    if (!details.state || !p2vData?.electionType || !p2vData?.electionLocation) {
      throw new BadRequestException(
        'Your campaign needs a state and district set up to generate AI insights. Please complete your Path to Victory first.',
      )
    }

    const topIssueNames = campaign.topIssues?.map((ti) => ti.name) ?? []

    const autoParams: Record<string, unknown> = {
      state: details.state,
      l2DistrictType: p2vData.electionType,
      l2DistrictName: p2vData.electionLocation,
      districtType: details.district || details.ballotLevel,
      districtName: details.otherOffice || details.office,
      office: details.otherOffice || details.office,
      party: details.party,
      city: details.city,
      county: details.county,
      zip: details.zip,
      topIssues: topIssueNames,
      ...(p2vData.winNumber != null && { winNumber: p2vData.winNumber }),
      ...(p2vData.voterContactGoal != null && {
        voterContactGoal: p2vData.voterContactGoal,
      }),
      ...(p2vData.projectedTurnout != null && {
        projectedTurnout: p2vData.projectedTurnout,
      }),
    }

    return this.dispatchService.dispatch({
      experimentId: body.experimentId,
      organizationSlug: campaign.organizationSlug,
      params: { ...body.params, ...autoParams },
    })
  }

  private async dispatchServeExperiment(
    user: User,
    campaign: CampaignWithRelations,
    details: PrismaJson.CampaignDetails,
    body: RequestExperimentDto,
  ) {
    if (!campaign.electedOffices?.length) {
      throw new ForbiddenException(
        'This experiment requires an active elected office',
      )
    }

    if (!details.state) {
      throw new BadRequestException(
        'Your campaign needs a state to generate AI insights.',
      )
    }

    const p2vData = campaign.pathToVictory?.data
    const topIssueNames = campaign.topIssues?.map((ti) => ti.name) ?? []
    const electedOffice = campaign.electedOffices[0]

    const autoParams: Record<string, unknown> = {
      state: details.state,
      officialName: [user.firstName, user.lastName].filter(Boolean).join(' '),
      officeName: details.otherOffice || details.office,
      city: details.city,
      county: details.county,
      zip: details.zip,
      topIssues: topIssueNames,
      ...(p2vData?.electionType && { l2DistrictType: p2vData.electionType }),
      ...(p2vData?.electionLocation && {
        l2DistrictName: p2vData.electionLocation,
      }),
      ...(details.district && { districtType: details.district }),
      ...(electedOffice.swornInDate && {
        swornInDate: electedOffice.swornInDate,
      }),
    }

    if (body.experimentId === 'peer_city_benchmarking') {
      const organizationSlug = campaign.organizationSlug
      const districtIntelRun = await this.experimentRuns.findFirst({
        where: {
          organizationSlug,
          experimentId: 'district_intel',
          status: 'SUCCESS',
        },
        orderBy: { createdAt: 'desc' },
      })

      if (!districtIntelRun?.artifactBucket || !districtIntelRun?.artifactKey) {
        throw new BadRequestException(
          'Generate a District Intel report first before running Peer City Benchmarking.',
        )
      }

      autoParams.districtIntelRunId = districtIntelRun.runId
      autoParams.districtIntelArtifactKey = districtIntelRun.artifactKey
      autoParams.districtIntelArtifactBucket = districtIntelRun.artifactBucket
    }

    if (body.experimentId === 'meeting_briefing') {
      const organizationSlug = campaign.organizationSlug
      const districtIntelRun = await this.experimentRuns.findFirst({
        where: {
          organizationSlug,
          experimentId: 'district_intel',
          status: 'SUCCESS',
        },
        orderBy: { createdAt: 'desc' },
      })

      if (districtIntelRun?.artifactBucket && districtIntelRun?.artifactKey) {
        autoParams.districtIntelRunId = districtIntelRun.runId
        autoParams.districtIntelArtifactKey = districtIntelRun.artifactKey
        autoParams.districtIntelArtifactBucket = districtIntelRun.artifactBucket
      }
    }

    return this.dispatchService.dispatch({
      experimentId: body.experimentId,
      organizationSlug: campaign.organizationSlug,
      params: { ...body.params, ...autoParams },
    })
  }
}
