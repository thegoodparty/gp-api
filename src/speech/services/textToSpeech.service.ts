import { Engine, VoiceId } from '@aws-sdk/client-polly'
import {
  HttpException,
  HttpStatus,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { createHash } from 'crypto'
import { PinoLogger } from 'nestjs-pino'
import {
  SynthesizeSpeechRequest,
  SynthesizeSpeechResponse,
} from '@goodparty_org/contracts'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { chunkBySentence } from '../util/chunkBySentence'
import { UserRequestBudget } from '../util/userRequestBudget'
import { PollyService } from './polly.service'

const SPEECH_BUCKET =
  process.env.MEETING_PIPELINE_BUCKET ?? 'meeting-pipeline-dev'
const SYNTH_PREFIX = 'speech/synth'
const POLLY_MAX_CHARS = 2900
const PRESIGNED_URL_EXPIRES_SECONDS = 600
const AUDIO_FORMAT = 'audio/mpeg' as const

const TTS_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const TTS_RATE_LIMIT_PER_USER = 50

type SynthesizeInput = {
  user: User
  request: SynthesizeSpeechRequest
}

@Injectable()
export class TextToSpeechService {
  private readonly budget = new UserRequestBudget({
    windowMs: TTS_RATE_LIMIT_WINDOW_MS,
    limit: TTS_RATE_LIMIT_PER_USER,
  })

  constructor(
    private readonly pollyService: PollyService,
    private readonly s3Service: S3Service,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TextToSpeechService.name)
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeSpeechResponse> {
    const { user, request } = input

    if (!this.budget.tryAdmit(user.id)) {
      throw new HttpException(
        'Speech synthesis rate limit exceeded; please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    const voiceId: VoiceId = request.options?.voiceId ?? 'Amy'
    const engine: Engine = request.options?.engine ?? 'generative'

    // The contracts schema enforces non-empty + max length on request.text;
    // chunkBySentence may still yield zero chunks if the input is purely
    // whitespace or punctuation that the splitter strips.
    const chunks = chunkBySentence(request.text, POLLY_MAX_CHARS)
    if (chunks.length === 0) {
      throw new UnprocessableEntityException(
        'Input text contains no readable content',
      )
    }

    const cacheKey = this.buildTextCacheKey(request.text)

    this.logger.info(
      {
        userId: user.id,
        chunkCount: chunks.length,
        textLength: request.text.length,
        voiceId,
        engine,
      },
      'Synthesizing speech segments',
    )

    let cacheHits = 0
    const segments = await Promise.all(
      chunks.map(async (chunk, index) => {
        const key = this.buildSegmentKey(cacheKey, voiceId, engine, chunk)
        const cached = await this.s3Service.getFile(SPEECH_BUCKET, key)
        if (cached !== undefined) {
          cacheHits += 1
        } else {
          const synth = await this.pollyService.synthesize(chunk, {
            voiceId,
            engine,
          })
          await this.s3Service.uploadFile(SPEECH_BUCKET, synth.audio, key, {
            contentType: synth.contentType,
            cacheControl: 'private, max-age=86400',
          })
        }
        const url = await this.s3Service.getSignedUrlForViewing(
          SPEECH_BUCKET,
          key,
          { expiresIn: PRESIGNED_URL_EXPIRES_SECONDS },
        )
        return {
          index,
          url,
          expiresInSeconds: PRESIGNED_URL_EXPIRES_SECONDS,
        }
      }),
    )

    this.logger.info(
      {
        userId: user.id,
        cacheHits,
        cacheMisses: chunks.length - cacheHits,
      },
      'Speech synthesis complete',
    )

    return {
      format: AUDIO_FORMAT,
      segments,
    }
  }

  /**
   * Top-level cache key for a synthesis request. Hashing the raw text means
   * the same text from two different callers (or the same caller twice) hits
   * the same Polly cache, and any change to the text invalidates the prior
   * audio automatically.
   *
   * The voice + engine + per-chunk hash are folded in further down in
   * `buildSegmentKey` so different voices/engines do not collide.
   */
  private buildTextCacheKey(text: string): string {
    return createHash('sha1').update(text).digest('hex')
  }

  private buildSegmentKey(
    cacheKey: string,
    voiceId: VoiceId,
    engine: Engine,
    chunk: string,
  ): string {
    const hash = createHash('sha1').update(chunk).digest('hex')
    return `${SYNTH_PREFIX}/${cacheKey}/${voiceId}/${engine}/${hash}.mp3`
  }
}
