import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateProjectSchema } from '../schemas/createProject.schema'
import { RumbleUpService } from './rumbleUp.service'
import { TextCampaignStatus } from '@prisma/client'

@Injectable()
export class TextCampaignService {
  public readonly logger = new Logger(TextCampaignService.name)

  constructor(
    private readonly rumbleUpService: RumbleUpService,
    private readonly prisma: PrismaService,
  ) {}

  async createProject(
    campaignId: number,
    createProjectDto: CreateProjectSchema,
  ) {
    // Format data for the RumbleUp API call
    const rumbleUpProjectData = {
      name: createProjectDto.name,
      msg: createProjectDto.message,
      areacode: createProjectDto.areaCode,
      group: createProjectDto.groupId,
      flags: createProjectDto.flags,
      outsource_start: createProjectDto.outsourceStart,
      outsource_end: createProjectDto.outsourceEnd,
      outsource_email: createProjectDto.outsourceEmail,
    }

    // Call RumbleUp API to create the project
    const response =
      await this.rumbleUpService.createProject(rumbleUpProjectData)

    if (!response.success) {
      throw new Error(
        `Failed to create project in RumbleUp: ${response.error || response.message}`,
      )
    }

    // Create a new TextCampaign record (no longer using upsert since we can have multiple per campaign)
    const textCampaign = await this.prisma.textCampaign.create({
      data: {
        campaignId,
        projectId: response.data?.id || null,
        name: createProjectDto.name,
        message: createProjectDto.message,
      },
    })

    return textCampaign
  }

  async findByCampaignId(campaignId: number) {
    // Returns all text campaigns for the given campaign
    const textCampaigns = await this.prisma.textCampaign.findMany({
      where: { campaignId },
    })

    if (!textCampaigns.length) {
      throw new NotFoundException(
        `No text campaigns found for campaign ID ${campaignId}`,
      )
    }

    return textCampaigns
  }

  async createTextCampaign(
    campaignId: number,
    name: string,
    message: string,
    audience?: {
      audience_superVoters?: boolean
      audience_likelyVoters?: boolean
      audience_unreliableVoters?: boolean
      audience_unlikelyVoters?: boolean
      audience_firstTimeVoters?: boolean
      party_independent?: boolean
      party_democrat?: boolean
      party_republican?: boolean
      age_18_25?: boolean
      age_25_35?: boolean
      age_35_50?: boolean
      age_50_plus?: boolean
      gender_male?: boolean
      gender_female?: boolean
      gender_unknown?: boolean
      audience_request?: string
    },
    script?: string,
    date?: Date,
    imageUrl?: string,
  ) {
    return this.prisma.textCampaign.create({
      data: {
        campaignId,
        name,
        message,
        status: TextCampaignStatus.pending,
        ...(audience && {
          audience_superVoters: audience.audience_superVoters,
          audience_likelyVoters: audience.audience_likelyVoters,
          audience_unreliableVoters: audience.audience_unreliableVoters,
          audience_unlikelyVoters: audience.audience_unlikelyVoters,
          audience_firstTimeVoters: audience.audience_firstTimeVoters,
          party_independent: audience.party_independent,
          party_democrat: audience.party_democrat,
          party_republican: audience.party_republican,
          age_18_25: audience.age_18_25,
          age_25_35: audience.age_25_35,
          age_35_50: audience.age_35_50,
          age_50_plus: audience.age_50_plus,
          gender_male: audience.gender_male,
          gender_female: audience.gender_female,
          gender_unknown: audience.gender_unknown,
          audience_request: audience.audience_request,
        }),
        script,
        date,
        imageUrl,
      },
    })
  }
}
