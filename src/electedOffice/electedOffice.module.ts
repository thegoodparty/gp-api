import { OrganizationsModule } from '@/organizations/organizations.module'
import { MeetingsModule } from '@/meetings/meetings.module'
import { Module, forwardRef } from '@nestjs/common'
import { ElectedOfficeController } from './electedOffice.controller'
import { UseElectedOfficeGuard } from './guards/UseElectedOffice.guard'
import { UserOrM2MGuard } from './guards/UserOrM2M.guard'
import { ElectedOfficeService } from './services/electedOffice.service'

@Module({
  imports: [OrganizationsModule, forwardRef(() => MeetingsModule)],
  controllers: [ElectedOfficeController],
  providers: [ElectedOfficeService, UseElectedOfficeGuard, UserOrM2MGuard],
  exports: [ElectedOfficeService, UseElectedOfficeGuard],
})
export class ElectedOfficeModule {}
