import { Module } from '@nestjs/common'
import { ElectedOfficeController } from './electedOffice.controller'
import { ElectedOfficeService } from './services/electedOffice.service'
import { UseElectedOfficeGuard } from './guards/UseElectedOffice.guard'
import { UserOrM2MGuard } from './guards/UserOrM2M.guard'

@Module({
  imports: [],
  controllers: [ElectedOfficeController],
  providers: [ElectedOfficeService, UseElectedOfficeGuard, UserOrM2MGuard],
  exports: [ElectedOfficeService],
})
export class ElectedOfficeModule {}
