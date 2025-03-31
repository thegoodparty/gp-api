import {
  Injectable,
  NotFoundException,
  BadGatewayException,
} from '@nestjs/common'
import { CreateProjectSchema } from '../schemas/createProject.schema'
import { RumbleUpService } from './rumbleUp.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class TextCampaignService extends createPrismaBase(MODELS.TextCampaign) {
  constructor(private readonly rumbleUpService: RumbleUpService) {
    super()
  }

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
      throw new BadGatewayException(
        `Failed to create project in RumbleUp: ${response.error || response.message}`,
      )
    }

    // Create a new TextCampaign record (no longer using upsert since we can have multiple per campaign)
    const textCampaign = await this.model.create({
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
    const textCampaigns = await this.findMany({
      where: { campaignId },
    })

    if (!textCampaigns.length) {
      throw new NotFoundException(
        `No text campaigns found for campaign ID ${campaignId}`,
      )
    }

    return textCampaigns
  }
}
