/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
import {
  AudioStream,
  LanguageCode,
  MediaEncoding,
  StartStreamTranscriptionCommand,
  TranscribeStreamingClient,
  TranscriptResultStream,
} from '@aws-sdk/client-transcribe-streaming'
import { Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'

const { AWS_REGION: region = 'us-west-2' } = process.env

const SAMPLE_RATE_HERTZ = 16000

export type TranscriptEvent =
  | { type: 'transcript'; isPartial: boolean; text: string }
  | { type: 'upstream_error'; code: string; message: string }
  | { type: 'upstream_closed' }

export type StartTranscriptionInput = {
  audio: AsyncIterable<Buffer>
  abortSignal: AbortSignal
  onEvent: (event: TranscriptEvent) => void
}

@Injectable()
export class TranscribeStreamingService {
  private readonly client: TranscribeStreamingClient

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(TranscribeStreamingService.name)
    this.client = new TranscribeStreamingClient({ region })
  }

  async start(input: StartTranscriptionInput): Promise<void> {
    const audioStream = this.toAudioEventStream(input.audio)
    const command = new StartStreamTranscriptionCommand({
      LanguageCode: LanguageCode.EN_US,
      MediaEncoding: MediaEncoding.PCM,
      MediaSampleRateHertz: SAMPLE_RATE_HERTZ,
      AudioStream: audioStream,
    })

    let response
    try {
      response = await this.client.send(command, {
        abortSignal: input.abortSignal,
      })
    } catch (error) {
      this.logger.error({ error }, 'Failed to start Transcribe stream')
      input.onEvent({
        type: 'upstream_error',
        code: 'TRANSCRIBE_START_FAILED',
        message: 'Failed to start transcription',
      })
      return
    }

    if (!response.TranscriptResultStream) {
      input.onEvent({
        type: 'upstream_error',
        code: 'TRANSCRIBE_NO_STREAM',
        message: 'Transcription stream unavailable',
      })
      return
    }

    try {
      for await (const event of response.TranscriptResultStream) {
        if (input.abortSignal.aborted) {
          break
        }
        this.handleResultEvent(event, input.onEvent)
      }
      input.onEvent({ type: 'upstream_closed' })
    } catch (error) {
      if (input.abortSignal.aborted) {
        input.onEvent({ type: 'upstream_closed' })
        return
      }
      this.logger.error({ error }, 'Transcribe result stream errored')
      input.onEvent({
        type: 'upstream_error',
        code: 'TRANSCRIBE_STREAM_ERROR',
        message: 'Transcription stream interrupted',
      })
    }
  }

  private async *toAudioEventStream(
    audio: AsyncIterable<Buffer>,
  ): AsyncIterable<AudioStream> {
    for await (const chunk of audio) {
      yield { AudioEvent: { AudioChunk: chunk } }
    }
  }

  private handleResultEvent(
    event: TranscriptResultStream,
    emit: (event: TranscriptEvent) => void,
  ) {
    const transcriptEvent = event.TranscriptEvent
    if (!transcriptEvent?.Transcript?.Results) {
      return
    }
    for (const result of transcriptEvent.Transcript.Results) {
      const alternative = result.Alternatives?.[0]
      const text = alternative?.Transcript ?? ''
      if (text.length === 0) {
        continue
      }
      emit({
        type: 'transcript',
        isPartial: result.IsPartial ?? false,
        text,
      })
    }
  }
}
