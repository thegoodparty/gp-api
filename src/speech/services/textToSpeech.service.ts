import { Engine, VoiceId } from '@aws-sdk/client-polly'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Organization, User } from '@prisma/client'
import { createHash } from 'crypto'
import { PinoLogger } from 'nestjs-pino'
import {
  SpeechSynthesisTargetType,
  SynthesizeSpeechRequest,
  SynthesizeSpeechResponse,
} from '@goodparty_org/contracts'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { chunkBySentence } from '../util/chunkBySentence'
import { BriefingTextSource } from './briefingTextSource.service'
import { PollyService } from './polly.service'
import { TargetTextSource } from './targetTextSource.types'

const SPEECH_BUCKET =
  process.env.MEETING_PIPELINE_BUCKET ?? 'meeting-pipeline-dev'
const SYNTH_PREFIX = 'speech/synth'
const POLLY_MAX_CHARS = 2900
const PRESIGNED_URL_EXPIRES_SECONDS = 600
const AUDIO_FORMAT = 'audio/mpeg' as const

type TargetType = SpeechSynthesisTargetType

type SynthesizeInput = {
  user: User
  organization: Organization
  request: SynthesizeSpeechRequest
}

@Injectable()
export class TextToSpeechService {
  private readonly sources: Map<TargetType, TargetTextSource<TargetType>>

  constructor(
    private readonly pollyService: PollyService,
    private readonly s3Service: S3Service,
    private readonly briefingTextSource: BriefingTextSource,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(TextToSpeechService.name)
    this.sources = new Map<TargetType, TargetTextSource<TargetType>>([
      [briefingTextSource.type, briefingTextSource],
    ])
  }

  async synthesize(input: SynthesizeInput): Promise<SynthesizeSpeechResponse> {
    const { request, user, organization } = input
    const source = this.sources.get(request.target.type)
    if (!source) {
      throw new NotFoundException(
        `No text source registered for target type: ${request.target.type}`,
      )
    }

    // SpeechSynthesisVoice/Engine are strict subsets of Polly's VoiceId/Engine
    // unions, validated by the request schema.
    const voiceId: VoiceId = request.options?.voiceId ?? 'Joanna'
    const engine: Engine = request.options?.engine ?? 'neural'

    const { text, cacheKey } = await source.loadText({
      id: request.target.id,
      user,
      organization,
    })

    const chunks = chunkBySentence(text, POLLY_MAX_CHARS)
    if (chunks.length === 0) {
      throw new NotFoundException('Target produced no readable text')
    }

    this.logger.info(
      {
        targetType: request.target.type,
        targetId: request.target.id,
        chunkCount: chunks.length,
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
        targetType: request.target.type,
        targetId: request.target.id,
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
