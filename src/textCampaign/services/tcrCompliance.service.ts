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
    submitSuccesful: boolean,
  ) {
    return this.model.upsert({
      where: { campaignId },
      update: {
        ...body,
        status: submitSuccesful
          ? TcrComplianceStatus.submitted
          : TcrComplianceStatus.error,
      },
      create: {
        campaignId,
        ...body,
        status: submitSuccesful
          ? TcrComplianceStatus.submitted
          : TcrComplianceStatus.error,
      },
    })
  }

  async updatePin(campaignId: number, pin: string) {
    return this.model.update({
      where: { campaignId },
      data: {
        pin,
        status: TcrComplianceStatus.pending,
      },
    })
  }

  async findByCampaignId(campaignId: number) {
    return this.model.findUnique({
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
