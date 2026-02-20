import { Module } from '@nestjs/common'
import { ElectedOfficeController } from './electedOffice.controller'
import { ElectedOfficeService } from './services/electedOffice.service'
import { UseElectedOfficeGuard } from './guards/UseElectedOffice.guard'
import { OwnerOrM2MGuard } from './guards/OwnerOrM2M.guard'
import { ClerkClientProvider } from '@/authentication/providers/clerk-client.provider'

@Module({
  imports: [],
  controllers: [ElectedOfficeController],
  providers: [
    ElectedOfficeService,
    UseElectedOfficeGuard,
    OwnerOrM2MGuard,
    ClerkClientProvider,
  ],
  exports: [ElectedOfficeService],
})
export class ElectedOfficeModule {}
