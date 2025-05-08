import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CreateProjectSchema } from '../schemas/createProject.schema'
import { RumbleUpService } from './rumbleUp.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { ComplianceFormSchema } from '../schemas/complianceForm.schema'
import { Campaign } from '@prisma/client'

@Injectable()
export class OutreachService extends createPrismaBase(MODELS.TextCampaign) {
  constructor(private readonly rumbleUpService: RumbleUpService) {
    super()
  }

  async submitComplianceForm(campaign: Campaign, body: ComplianceFormSchema) {
    try {
      this.logger.debug(
        `Submitting compliance form for campaign: ${campaign.id}`,
        body,
      )
      return await this.rumbleUpService.submitComplianceForm(campaign, body)
    } catch (error: any) {
      const msg = `Failed to submit compliance form for campaign: ${campaign.id} | ${error?.message}`
      this.logger.error(msg, error)
      throw new BadGatewayException(msg)
    }
  }

  async submitCompliancePin(campaign: Campaign, pin: string) {
    this.logger.debug(`Submitting compliance pin for campaign: ${campaign.id}`)
    try {
      return await this.rumbleUpService.submitCompliancePin(pin)
    } catch (error: any) {
      const msg = `Failed to submit compliance pin for campaign: ${campaign.id} | ${error?.message}`
      this.logger.error(msg, error)
      throw new BadGatewayException(msg)
    }
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
