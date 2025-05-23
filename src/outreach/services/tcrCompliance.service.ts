import { Injectable } from '@nestjs/common'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { TcrComplianceStatus } from '../types/compliance.types'
import { ComplianceFormSchema } from '../schemas/complianceForm.schema'

@Injectable()
export class TcrComplianceService extends createPrismaBase(
  MODELS.TcrCompliance,
) {
  async upsertCompliance(
    campaignId: number,
    body: ComplianceFormSchema,
    status: TcrComplianceStatus,
  ) {
    return this.model.upsert({
      where: { campaignId },
      update: {
        ...body,
        status,
      },
      create: {
        campaignId,
        ...body,
        status,
      },
    })
  }

  async updatePin(
    campaignId: number,
    pin: string,
    status: TcrComplianceStatus,
  ) {
    return this.model.update({
      where: { campaignId },
      data: {
        pin,
        status,
      },
    })
  }

  async findByCampaignId(campaignId: number) {
    return this.model.findUniqueOrThrow({
      where: { campaignId },
    })
  }

  async updateStatus(campaignId: number, status: TcrComplianceStatus) {
    return this.model.update({
      where: { campaignId },
      data: { status },
    })
  }
}
