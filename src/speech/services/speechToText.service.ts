import { HttpException, HttpStatus, Injectable } from '@nestjs/common'
import { User } from '../../generated/prisma'
import { TranscribeSessionResponse } from '@goodparty_org/contracts'
import { PinoLogger } from 'nestjs-pino'
import { UserRequestBudget } from '../util/userRequestBudget'
import { TRANSCRIBE_STREAM_PATH } from '../ws/speechToText.gateway'
import { TranscriptionTicketService } from './transcriptionTicket.service'

const PUBLIC_BASE_URL = process.env.PUBLIC_API_URL ?? ''

const STT_SESSION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000
const STT_SESSION_RATE_LIMIT_PER_USER = 30

export type CreateSessionInput = {
  user: User
}

@Injectable()
export class SpeechToTextService {
  private readonly budget = new UserRequestBudget({
    windowMs: STT_SESSION_RATE_LIMIT_WINDOW_MS,
    limit: STT_SESSION_RATE_LIMIT_PER_USER,
  })

  constructor(
    private readonly ticketService: TranscriptionTicketService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SpeechToTextService.name)
  }

  createSession(input: CreateSessionInput): TranscribeSessionResponse {
    if (!this.budget.tryAdmit(input.user.id)) {
      throw new HttpException(
        'Speech transcription session rate limit exceeded; please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    const minted = this.ticketService.mint({ userId: input.user.id })
    const wsUrl = this.buildWsUrl(minted.ticket)
    this.logger.info({ userId: input.user.id }, 'Issued speech-to-text ticket')
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
