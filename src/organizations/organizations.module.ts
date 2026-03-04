import { Module } from '@nestjs/common'
import { OrganizationsService } from './services/organizations.service'
import { ElectionsModule } from '@/elections/elections.module'
import { OrganizationsController } from './organizations.controller'

@Module({
  imports: [ElectionsModule],
  providers: [OrganizationsService],
  controllers: [OrganizationsController],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
