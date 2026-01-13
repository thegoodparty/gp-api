import { Module } from '@nestjs/common'
import { ElectedOfficeController } from './electedOffice.controller'
import { UseElectedOfficeGuard } from './guards/UseElectedOffice.guard'
import { ElectedOfficeService } from './services/electedOffice.service'

@Module({
  imports: [],
  controllers: [ElectedOfficeController],
  providers: [ElectedOfficeService, UseElectedOfficeGuard],
  exports: [ElectedOfficeService],
})
export class ElectedOfficeModule {}
