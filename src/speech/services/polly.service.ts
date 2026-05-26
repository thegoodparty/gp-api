/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import {
  Engine,
  OutputFormat,
  PollyClient,
  SynthesizeSpeechCommand,
  TextType,
  VoiceId,
} from '@aws-sdk/client-polly'
import { BadGatewayException, Injectable } from '@nestjs/common'
import { PinoLogger } from 'nestjs-pino'

const { AWS_REGION: region = 'us-west-2' } = process.env

export type SynthesizeOptions = {
  voiceId: VoiceId
  engine: Engine
}

export type SynthesizeResult = {
  audio: Buffer
  contentType: string
  billableCharacters: number
}

@Injectable()
export class PollyService {
  private readonly client: PollyClient

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(PollyService.name)
    this.client = new PollyClient({ region })
  }

  async synthesize(
    text: string,
    options: SynthesizeOptions,
  ): Promise<SynthesizeResult> {
    let response
    try {
      response = await this.client.send(
        new SynthesizeSpeechCommand({
          Text: text,
          TextType: TextType.TEXT,
          OutputFormat: OutputFormat.MP3,
          VoiceId: options.voiceId,
          Engine: options.engine,
        }),
      )
    } catch (error) {
      this.logger.error(
        { error, voiceId: options.voiceId, engine: options.engine },
        'Polly SynthesizeSpeech failed',
      )
      throw new BadGatewayException('Failed to synthesize speech')
    }

    const stream = response.AudioStream
    if (!stream) {
      throw new BadGatewayException('Polly returned an empty audio stream')
    }

    const bytes = await stream.transformToByteArray()
    return {
      audio: Buffer.from(bytes),
      contentType: response.ContentType ?? 'audio/mpeg',
      billableCharacters: response.RequestCharacters ?? text.length,
    }
  }
}
