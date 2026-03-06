import { ElectionsModule } from '@/elections/elections.module'
import { Module } from '@nestjs/common'
import { UseOrganizationGuard } from './guards/UseOrganization.guard'
import { OrganizationsController } from './organizations.controller'
import { OrganizationsService } from './services/organizations.service'

@Module({
  imports: [ElectionsModule],
  providers: [OrganizationsService, UseOrganizationGuard],
  controllers: [OrganizationsController],
  exports: [OrganizationsService, UseOrganizationGuard],
})
export class OrganizationsModule {}
