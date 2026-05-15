import { Module } from '@nestjs/common'
import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { AnnotationsController } from './controllers/annotations.controller'
import { AnnotationsService } from './services/annotations.service'

@Module({
  imports: [ElectedOfficeModule],
  controllers: [AnnotationsController],
  providers: [AnnotationsService],
  exports: [AnnotationsService],
})
export class AnnotationsModule {}
