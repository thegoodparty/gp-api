import {
  BadGatewayException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CreateOutreachSchema } from '../schemas/createOutreachSchema'
import { RumbleUpService } from './rumbleUp.service'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { ComplianceFormSchema } from '../schemas/complianceForm.schema'
import { Campaign } from '@prisma/client'

@Injectable()
export class OutreachService extends createPrismaBase(MODELS.Outreach) {
  constructor(private readonly rumbleUpService: RumbleUpService) {
    super()
  }

  async submitComplianceForm(campaign: Campaign, body: ComplianceFormSchema) {
    try {
      this.logger.debug(
        `Submitting compliance form for campaign: ${campaign.id}`,
      )
      return await this.rumbleUpService.submitComplianceForm(campaign, body)
    } catch (error: any) {
      const msg = `Failed to submit compliance form for campaign: ${campaign.id} | ${error?.message}`
      this.logger.error(msg, error)
      throw new BadGatewayException(msg)
    }
  }

  async submitCompliancePin(campaign: Campaign, pin: string) {
    this.logger.debug(`Submitting compliance PIN for campaign: ${campaign.id}`)
    try {
      return await this.rumbleUpService.submitCompliancePin(campaign, pin)
    } catch (error: any) {
      const msg = `Failed to submit compliance PIN for campaign: ${campaign.id} | ${error?.message}`
      this.logger.error(msg, error)
      throw new BadGatewayException(msg)
    }
  }

  async create(campaignId: number, createOutreachDto: CreateOutreachSchema) {
    // TODO: implement actual outreach vendor logic once we have a vendor
    // // Format data for the RumbleUp API call
    // const rumbleUpProjectData = {
    //   name: createOutreachDto.name,
    //   msg: createOutreachDto.message,
    //   areacode: createOutreachDto.areaCode,
    //   group: createOutreachDto.groupId,
    //   flags: createOutreachDto.flags,
    //   outsource_start: createOutreachDto.outsourceStart,
    //   outsource_end: createOutreachDto.outsourceEnd,
    //   outsource_email: createOutreachDto.outsourceEmail,
    // }
    //
    // // Call RumbleUp API to create the project
    // const response =
    //   await this.rumbleUpService.createProject(rumbleUpProjectData)
    //
    // if (!response.success) {
    //   throw new BadGatewayException(
    //     `Failed to create project in RumbleUp: ${response.error || response.message}`,
    //   )
    // }

    return await this.model.create({
      data: {
        ...createOutreachDto,
      },
    })
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
