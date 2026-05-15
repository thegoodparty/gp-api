import { Module } from '@nestjs/common'
import { AwsModule } from '@/vendors/aws/aws.module'
import { SpeechToTextController } from './controllers/speechToText.controller'
import { TextToSpeechController } from './controllers/textToSpeech.controller'
import { PollyService } from './services/polly.service'
import { SpeechToTextService } from './services/speechToText.service'
import { TextToSpeechService } from './services/textToSpeech.service'
import { TranscribeStreamingService } from './services/transcribeStreaming.service'
import { TranscriptionTicketService } from './services/transcriptionTicket.service'
import { SpeechToTextGateway } from './ws/speechToText.gateway'

/**
 * Speech is intentionally a domain-agnostic "pure pipe" module:
 *   - TTS in: text → out: ordered presigned audio URLs
 *   - STT in: audio frames → out: transcript events
 *
 * It owns no domain knowledge and depends only on the AWS layer (Polly,
 * Transcribe, S3). Any caller wiring speech into a feature is responsible
 * for rendering text to read aloud and persisting any resulting transcripts
 * against whichever domain API owns them.
 */
@Module({
  imports: [AwsModule],
  controllers: [TextToSpeechController, SpeechToTextController],
  providers: [
    TextToSpeechService,
    PollyService,
    SpeechToTextService,
    TranscribeStreamingService,
    TranscriptionTicketService,
    SpeechToTextGateway,
  ],
  exports: [TextToSpeechService, SpeechToTextService],
})
export class SpeechModule {}
