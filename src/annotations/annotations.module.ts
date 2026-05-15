import { Module } from '@nestjs/common'
import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { AnnotationsController } from './controllers/annotations.controller'
import { BriefingAnnotationsController } from './controllers/briefingAnnotations.controller'
import { AnnotationsService } from './services/annotations.service'

@Module({
  imports: [ElectedOfficeModule],
  controllers: [BriefingAnnotationsController, AnnotationsController],
  providers: [AnnotationsService],
  exports: [AnnotationsService],
})
export class AnnotationsModule {}
