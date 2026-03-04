import { Module } from '@nestjs/common'
import { OrganizationsService } from './services/organizations.service'
import { OrganizationsBackfillService } from './services/organizations-backfill.service'
import { ElectionsModule } from '@/elections/elections.module'
import { OrganizationsController } from './organizations.controller'

@Module({
  imports: [ElectionsModule],
  providers: [OrganizationsService, OrganizationsBackfillService],
  controllers: [OrganizationsController],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
