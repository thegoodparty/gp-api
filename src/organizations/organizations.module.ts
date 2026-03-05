import { ElectionsModule } from '@/elections/elections.module'
import { Module } from '@nestjs/common'
import { UseOrganizationGuard } from './guards/UseOrganization.guard'
import { OrganizationsController } from './organizations.controller'
import { OrganizationsBackfillService } from './services/organizations-backfill.service'
import { OrganizationsService } from './services/organizations.service'

@Module({
  imports: [ElectionsModule],
  providers: [
    OrganizationsService,
    OrganizationsBackfillService,
    UseOrganizationGuard,
  ],
  controllers: [OrganizationsController],
  exports: [OrganizationsService, UseOrganizationGuard],
})
export class OrganizationsModule {}
