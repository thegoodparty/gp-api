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

  async create(createOutreachDto: CreateOutreachSchema, imageUrl?: string) {
    return await this.model.create({
      data: {
        ...createOutreachDto,
        ...(imageUrl ? { imageUrl } : {}),
      },
      include: {
        voterFileFilter: true,
      },
    })
  }

  async findByCampaignId(campaignId: number) {
    const outreachCampaigns = await this.findMany({
      where: { campaignId },
      include: {
        voterFileFilter: true,
      },
    })

    if (!outreachCampaigns.length) {
      throw new NotFoundException(
        `No text campaigns found for campaign ID ${campaignId}`,
      )
    }

    return outreachCampaigns
  }
}
