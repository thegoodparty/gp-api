import { Module } from '@nestjs/common'
import { MeetingsModule } from '@/meetings/meetings.module'
import { AwsModule } from '@/vendors/aws/aws.module'
import { SpeechToTextController } from './controllers/speechToText.controller'
import { TextToSpeechController } from './controllers/textToSpeech.controller'
import { BriefingTextSource } from './services/briefingTextSource.service'
import { PollyService } from './services/polly.service'
import { SpeechToTextService } from './services/speechToText.service'
import { TextToSpeechService } from './services/textToSpeech.service'
import { TranscribeStreamingService } from './services/transcribeStreaming.service'
import { TranscriptionTicketService } from './services/transcriptionTicket.service'
import { SpeechToTextGateway } from './ws/speechToText.gateway'

@Module({
  imports: [AwsModule, MeetingsModule],
  controllers: [TextToSpeechController, SpeechToTextController],
  providers: [
    TextToSpeechService,
    PollyService,
    BriefingTextSource,
    SpeechToTextService,
    TranscribeStreamingService,
    TranscriptionTicketService,
    SpeechToTextGateway,
  ],
  exports: [TextToSpeechService, SpeechToTextService],
})
export class SpeechModule {}
