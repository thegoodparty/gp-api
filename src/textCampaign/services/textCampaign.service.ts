import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateProjectSchema } from '../schemas/createProject.schema'
import { RumbleUpService } from './rumbleUp.service'
import { CampaignsService } from '../../campaigns/services/campaigns.service'
import { TextCampaignSummary } from '../textCampaign.types'
import { TextCampaignStatus } from '@prisma/client'

@Injectable()
export class TextCampaignService {
  public readonly logger = new Logger(TextCampaignService.name)

  constructor(
    @Inject(forwardRef(() => CampaignsService))
    private readonly campaignsService: CampaignsService,
    private readonly rumbleUpService: RumbleUpService,
    private readonly prisma: PrismaService,
  ) {}

  async createProject(
    campaignId: number,
    createProjectDto: CreateProjectSchema,
  ) {
    // Validate that the campaign exists
    const campaign = await this.campaignsService.findFirst({
      where: { id: campaignId },
    })

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${campaignId} not found`)
    }

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

  /**
   * Upload contacts from a CSV file and create a RumbleUp project
   *
   * This method performs two steps:
   * 1. Uploads a CSV file of contacts to RumbleUp, which returns a group ID
   * 2. Creates a project associated with the group ID
   *
   * The CSV file must have the following format:
   * - The first line should be a header with column names
   * - Required columns: "phone" and either "name" or "first_name"
   * - Optional columns: last_name, email, street, city, zipcode, etc.
   *
   * @param campaignId The campaign ID to associate the project with
   * @param csvData The CSV data as either:
   *   - A file path string to a CSV file on disk
   *   - A Buffer containing the CSV content
   * @param projectDetails Project details (name, message, etc.) excluding groupId which will be generated
   * @param fileName Optional filename if using Buffer (defaults to "contacts.csv")
   * @returns The created TextCampaign record
   */
  async uploadContactsAndCreateProject(
    campaignId: number,
    csvData: string | Buffer,
    projectDetails: Omit<CreateProjectSchema, 'groupId'>,
    fileName?: string,
  ) {
    // Validate that the campaign exists
    const campaign = await this.campaignsService.findFirst({
      where: { id: campaignId },
    })

    if (!campaign) {
      throw new NotFoundException(`Campaign with ID ${campaignId} not found`)
    }

    // Step 1: Upload the contacts CSV file and get the group ID
    const groupId = await this.rumbleUpService.uploadContactsAndGetGroupId(
      csvData,
      fileName,
    )

    // Step 2: Create a project using the group ID
    const createProjectDto: CreateProjectSchema = {
      ...projectDetails,
      groupId,
    }

    // Step 3: Create the project with the group ID
    return this.createProject(campaignId, createProjectDto)
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

  async findById(id: number) {
    const textCampaign = await this.prisma.textCampaign.findUnique({
      where: { id },
    })

    if (!textCampaign) {
      throw new NotFoundException(`Text campaign with ID ${id} not found`)
    }

    return textCampaign
  }

  async findAll(): Promise<TextCampaignSummary[]> {
    const textCampaigns = await this.prisma.textCampaign.findMany({
      include: {
        campaign: {
          include: {
            user: true,
          },
        },
      },
    })

    return textCampaigns.map((textCampaign) => ({
      projectId: textCampaign.projectId,
      name: textCampaign.name,
      message: textCampaign.message,
      campaignId: textCampaign.campaignId,
      error: textCampaign.error,
      status: textCampaign['status'] as string,
    }))
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

  async approveTextCampaign(textCampaignId: number) {
    return this.prisma.textCampaign.update({
      where: { id: textCampaignId },
      data: { status: TextCampaignStatus.approved },
    })
  }

  async denyTextCampaign(textCampaignId: number) {
    return this.prisma.textCampaign.update({
      where: { id: textCampaignId },
      data: { status: TextCampaignStatus.denied },
    })
  }
}
