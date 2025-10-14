import { Module } from '@nestjs/common'
import { ElectedOfficeController } from './electedOffice.controller'
import { ElectedOfficeService } from './services/electedOffice.service'
import { UseElectedOfficeGuard } from './guards/UseElectedOffice.guard'

@Module({
  imports: [],
  controllers: [ElectedOfficeController],
  providers: [ElectedOfficeService, UseElectedOfficeGuard],
  exports: [ElectedOfficeService],
})
export class ElectedOfficeModule {}
