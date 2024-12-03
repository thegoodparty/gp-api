import { Module } from '@nestjs/common'
import { AdminCampaignsController } from './campaigns/adminCampaigns.controller'
import { AdminCampaignsService } from './campaigns/adminCampaigns.service'
import { PrismaModule } from 'src/prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  controllers: [AdminCampaignsController],
  providers: [AdminCampaignsService],
})
export class AdminModule {}
