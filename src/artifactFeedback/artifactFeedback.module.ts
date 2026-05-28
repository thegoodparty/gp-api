import { Module } from '@nestjs/common'
import { ElectedOfficeModule } from '@/electedOffice/electedOffice.module'
import { BriefingFeedbackController } from './controllers/briefingFeedback.controller'
import { BriefingItemFeedbackController } from './controllers/briefingItemFeedback.controller'
import { ArtifactFeedbackService } from './services/artifactFeedback.service'

@Module({
  imports: [ElectedOfficeModule],
  controllers: [BriefingFeedbackController, BriefingItemFeedbackController],
  providers: [ArtifactFeedbackService],
  exports: [ArtifactFeedbackService],
})
export class ArtifactFeedbackModule {}
