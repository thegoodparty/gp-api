import { Injectable } from '@nestjs/common'
import { ElectedOffice, User } from '@prisma/client'
import {
  SpeechToTextTargetType,
  TranscribeSessionRequest,
  TranscribeSessionResponse,
} from '@goodparty_org/contracts'
import { PinoLogger } from 'nestjs-pino'
import { TRANSCRIBE_STREAM_PATH } from '../ws/speechToText.gateway'
import { TranscriptionTicketService } from './transcriptionTicket.service'
import { TargetAuthorizer } from './targetAuthorizer.types'

const PUBLIC_BASE_URL = process.env.PUBLIC_API_URL ?? ''

export type CreateSessionInput = {
  user: User
  electedOffice: ElectedOffice
  request: TranscribeSessionRequest
}

@Injectable()
export class SpeechToTextService {
  private readonly authorizers: Map<SpeechToTextTargetType, TargetAuthorizer> =
    new Map()

  constructor(
    private readonly ticketService: TranscriptionTicketService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SpeechToTextService.name)
  }

  registerAuthorizer(authorizer: TargetAuthorizer) {
    this.authorizers.set(authorizer.type, authorizer)
  }

  async createSession(
    input: CreateSessionInput,
  ): Promise<TranscribeSessionResponse> {
    const authorizer = this.authorizers.get(input.request.target.type)
    if (authorizer) {
      await authorizer.authorizeWrite({
        user: input.user,
        electedOffice: input.electedOffice,
        targetId: input.request.target.id,
      })
    }

    const minted = this.ticketService.mint({
      userId: input.user.id,
      electedOfficeId: input.electedOffice.id,
      target: input.request.target,
    })

    const wsUrl = this.buildWsUrl(minted.ticket)
    this.logger.info(
      {
        userId: input.user.id,
        electedOfficeId: input.electedOffice.id,
        targetType: input.request.target.type,
      },
      'Issued speech-to-text ticket',
    )
    return {
      wsUrl,
      expiresAt: minted.expiresAt.toISOString(),
    }
  }

  private buildWsUrl(ticket: string): string {
    const base = PUBLIC_BASE_URL.replace(/^http/, 'ws').replace(/\/$/, '')
    if (base.length === 0) {
      throw new Error(
        'PUBLIC_API_URL env var is required but not set; cannot build WebSocket URL',
      )
    }
    return `${base}${TRANSCRIBE_STREAM_PATH}?ticket=${encodeURIComponent(
      ticket,
    )}`
  }
}
