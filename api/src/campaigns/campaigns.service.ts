import { Injectable } from '@nestjs/common'
import { PrismaService } from 'src/prisma/prisma.service'
import { CreateCampaignDto } from './campaigns.dto'

@Injectable()
export class CampaignsService {
  constructor(private prismaService: PrismaService) {}

  findAll() {
    return this.prismaService.campaign.findMany()
  }

  findOne(id: number) {
    return this.prismaService.campaign.findFirst({ where: { id } })
  }

  create(createCampaignDto: CreateCampaignDto) {
    return this.prismaService.campaign.create({ data: createCampaignDto })
  }
}
