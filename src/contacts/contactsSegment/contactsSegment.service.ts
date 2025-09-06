import { Injectable } from '@nestjs/common'
import { ContactsSegment } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { CreateContactsSegmentDto } from './schemas/CreateContactsSegment.schema'
import { UpdateContactsSegmentDto } from './schemas/UpdateContactsSegment.schema'

@Injectable()
export class ContactsSegmentService extends createPrismaBase(
  MODELS.ContactsSegment,
) {
  constructor() {
    super()
  }

  async findByCampaignId(campaignId: number): Promise<ContactsSegment[]> {
    return this.model.findMany({
      where: { campaignId },
      orderBy: { name: 'asc' },
    })
  }

  async findByIdAndCampaignId(
    id: number,
    campaignId: number,
  ): Promise<ContactsSegment | null> {
    return this.findFirst({
      where: { id, campaignId },
    })
  }

  async create(
    data: CreateContactsSegmentDto,
    campaignId: number,
  ): Promise<ContactsSegment> {
    return this.model.create({
      data: {
        ...data,
        campaignId,
      },
    })
  }

  async update(
    id: number,
    data: UpdateContactsSegmentDto,
    campaignId: number,
  ): Promise<ContactsSegment> {
    return this.model.update({
      where: { id, campaignId },
      data,
    })
  }

  async delete(id: number, campaignId: number): Promise<void> {
    await this.model.delete({
      where: { id, campaignId },
    })
  }
}
