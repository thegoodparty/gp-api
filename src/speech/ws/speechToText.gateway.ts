import { Injectable, OnApplicationBootstrap } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { FastifyAdapter } from '@nestjs/platform-fastify'
import { FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import type { RawData, WebSocket } from 'ws'
import { z } from 'zod'
import { TranscribeStreamingService } from '../services/transcribeStreaming.service'
import {
  TranscriptionTicketPayload,
  TranscriptionTicketService,
} from '../services/transcriptionTicket.service'

export const TRANSCRIBE_STREAM_PATH = '/v1/speech/transcribe/stream'

const WS_CLOSE_UNAUTHORIZED = 4401
const WS_CLOSE_BAD_REQUEST = 4400
const WS_CLOSE_NORMAL = 1000
const WS_CLOSE_INTERNAL_ERROR = 1011

const HEARTBEAT_INTERVAL_MS = 30_000
const SESSION_HARD_CAP_MS = 10 * 60_000
const WARN_BEFORE_CAP_MS = 60_000
const WARN_AT_MS = SESSION_HARD_CAP_MS - WARN_BEFORE_CAP_MS

const RATE_LIMIT_BYTES_PER_SEC = 16 * 1024
const RATE_LIMIT_GRACE_MS = 2_000

const ClientStopMessageSchema = z.object({ type: z.literal('stop') }).strict()

type ClientStopMessage = z.infer<typeof ClientStopMessageSchema>

type TranscribeStreamQuery = {
  Querystring: { ticket?: string | string[] }
}

type ServerEvent =
  | { type: 'ready' }
  | { type: 'transcript'; isPartial: boolean; text: string }
  | { type: 'warning'; code: string; secondsRemaining: number }
  | { type: 'error'; code: string; message: string }
  | { type: 'closed'; reason: string }

type AudioPusher = (chunk: Buffer | null) => void

type SessionContext = {
  socket: WebSocket
  ticket: TranscriptionTicketPayload
  audioPushers: AudioPusher[]
  abortController: AbortController
  bytesReceived: number
  startedAtMs: number
  heartbeatTimer: NodeJS.Timeout
  warnTimer: NodeJS.Timeout
  capTimer: NodeJS.Timeout
  closed: boolean
}

const parseClientStop = (text: string): ClientStopMessage | null => {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  const result = ClientStopMessageSchema.safeParse(parsed)
  return result.success ? result.data : null
}

@Injectable()
export class SpeechToTextGateway implements OnApplicationBootstrap {
  constructor(
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly ticketService: TranscriptionTicketService,
    private readonly transcribeService: TranscribeStreamingService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SpeechToTextGateway.name)
  }

  onApplicationBootstrap() {
    // HttpAdapterHost.httpAdapter is the abstract HttpAdapter; we know we run
    // on Fastify because @nestjs/platform-fastify is the only adapter wired in
    // src/app.ts, so narrowing here is safe.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const adapter = this.httpAdapterHost.httpAdapter as FastifyAdapter
    const fastify = adapter.getInstance()
    fastify.get<TranscribeStreamQuery>(
      TRANSCRIBE_STREAM_PATH,
      { websocket: true },
      (socket, request) => this.handleConnection(socket, request),
    )
    this.logger.info(
      { path: TRANSCRIBE_STREAM_PATH },
      'Registered speech-to-text WebSocket route',
    )
  }

  private handleConnection(
    socket: WebSocket,
    request: FastifyRequest<TranscribeStreamQuery>,
  ) {
    const ticket = this.extractTicket(request)
    if (!ticket) {
      this.closeWithCode(
        socket,
        WS_CLOSE_BAD_REQUEST,
        'missing_ticket',
        'Ticket query parameter is required',
      )
      return
    }

    let payload: TranscriptionTicketPayload
    try {
      payload = this.ticketService.verify(ticket)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'invalid ticket'
      this.closeWithCode(socket, WS_CLOSE_UNAUTHORIZED, 'unauthorized', message)
      return
    }

    const context = this.createSession(socket, payload)
    this.startTranscription(context)
  }

  private extractTicket(
    request: FastifyRequest<TranscribeStreamQuery>,
  ): string | null {
    const value = request.query?.ticket
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0]
    }
    return null
  }

  private createSession(
    socket: WebSocket,
    ticket: TranscriptionTicketPayload,
  ): SessionContext {
    const startedAtMs = Date.now()
    const abortController = new AbortController()

    const heartbeatTimer = setInterval(() => {
      if (socket.readyState === socket.OPEN) {
        socket.ping()
      }
    }, HEARTBEAT_INTERVAL_MS)

    const warnTimer = setTimeout(() => {
      this.sendEvent(socket, {
        type: 'warning',
        code: 'MAX_DURATION_APPROACHING',
        secondsRemaining: Math.round(WARN_BEFORE_CAP_MS / 1000),
      })
    }, WARN_AT_MS)

    const capTimer = setTimeout(() => {
      this.endSession(context, 'max_duration', WS_CLOSE_NORMAL)
    }, SESSION_HARD_CAP_MS)

    const context: SessionContext = {
      socket,
      ticket,
      audioPushers: [],
      abortController,
      bytesReceived: 0,
      startedAtMs,
      heartbeatTimer,
      warnTimer,
      capTimer,
      closed: false,
    }

    socket.on('message', (data, isBinary) =>
      this.onMessage(context, data, isBinary),
    )
    socket.on('close', () => this.onSocketClosed(context))
    socket.on('error', (error) => {
      this.logger.warn(
        { error, userId: ticket.uid },
        'Speech-to-text WebSocket errored',
      )
      this.endSession(context, 'socket_error', WS_CLOSE_INTERNAL_ERROR)
    })

    return context
  }

  private startTranscription(context: SessionContext) {
    const audioIterable = this.makeAudioIterable(context)
    void this.transcribeService
      .start({
        audio: audioIterable,
        abortSignal: context.abortController.signal,
        onEvent: (event) => {
          if (event.type === 'transcript') {
            this.sendEvent(context.socket, {
              type: 'transcript',
              isPartial: event.isPartial,
              text: event.text,
            })
            return
          }
          if (event.type === 'upstream_error') {
            this.sendEvent(context.socket, {
              type: 'error',
              code: event.code,
              message: event.message,
            })
            this.endSession(context, 'upstream_error', WS_CLOSE_INTERNAL_ERROR)
            return
          }
          this.endSession(context, 'upstream_closed', WS_CLOSE_NORMAL)
        },
      })
      .catch((error: Error) => {
        this.logger.error(
          { error, userId: context.ticket.uid },
          'Transcribe streaming threw',
        )
        this.endSession(context, 'upstream_error', WS_CLOSE_INTERNAL_ERROR)
      })

    this.sendEvent(context.socket, { type: 'ready' })
  }

  private makeAudioIterable(context: SessionContext): AsyncIterable<Buffer> {
    return {
      [Symbol.asyncIterator]: () => {
        const queue: Buffer[] = []
        const waiters: Array<(value: IteratorResult<Buffer>) => void> = []
        let done = false

        const push: AudioPusher = (chunk) => {
          if (done) {
            return
          }
          if (chunk === null) {
            done = true
            const waiter = waiters.shift()
            if (waiter) {
              waiter({ value: undefined, done: true })
            }
            return
          }
          const waiter = waiters.shift()
          if (waiter) {
            waiter({ value: chunk, done: false })
          } else {
            queue.push(chunk)
          }
        }

        context.audioPushers.push(push)

        return {
          next: () => {
            const next = queue.shift()
            if (next !== undefined) {
              return Promise.resolve({ value: next, done: false })
            }
            if (done) {
              return Promise.resolve({ value: undefined, done: true })
            }
            return new Promise<IteratorResult<Buffer>>((resolve) =>
              waiters.push(resolve),
            )
          },
          return: () => {
            done = true
            for (const waiter of waiters) {
              waiter({ value: undefined, done: true })
            }
            waiters.length = 0
            return Promise.resolve({ value: undefined, done: true })
          },
        }
      },
    }
  }

  private onMessage(context: SessionContext, data: RawData, isBinary: boolean) {
    if (context.closed) {
      return
    }
    if (isBinary) {
      const buffer = this.toBuffer(data)
      context.bytesReceived += buffer.length
      if (this.exceedsRateLimit(context)) {
        this.sendEvent(context.socket, {
          type: 'error',
          code: 'RATE_LIMIT',
          message: 'Audio rate limit exceeded',
        })
        this.endSession(context, 'rate_limit', WS_CLOSE_NORMAL)
        return
      }
      for (const push of context.audioPushers) {
        push(buffer)
      }
      return
    }
    const text = this.toBuffer(data).toString('utf8')
    const parsed = parseClientStop(text)
    if (!parsed) {
      this.sendEvent(context.socket, {
        type: 'error',
        code: 'BAD_FRAME',
        message: 'Text frame must be a JSON stop message',
      })
      return
    }
    this.endSession(context, 'client_stop', WS_CLOSE_NORMAL)
  }

  private exceedsRateLimit(context: SessionContext): boolean {
    const elapsedMs = Date.now() - context.startedAtMs
    if (elapsedMs < RATE_LIMIT_GRACE_MS) {
      return false
    }
    const bytesPerSec = (context.bytesReceived / elapsedMs) * 1000
    return bytesPerSec > RATE_LIMIT_BYTES_PER_SEC
  }

  private toBuffer(data: RawData): Buffer {
    if (Buffer.isBuffer(data)) {
      return data
    }
    if (Array.isArray(data)) {
      return Buffer.concat(data)
    }
    return Buffer.from(data)
  }

  private endSession(context: SessionContext, reason: string, code: number) {
    if (context.closed) {
      return
    }
    context.closed = true
    clearInterval(context.heartbeatTimer)
    clearTimeout(context.warnTimer)
    clearTimeout(context.capTimer)
    for (const push of context.audioPushers) {
      push(null)
    }
    context.abortController.abort()
    this.sendEvent(context.socket, { type: 'closed', reason })
    if (
      context.socket.readyState === context.socket.OPEN ||
      context.socket.readyState === context.socket.CONNECTING
    ) {
      try {
        context.socket.close(code, reason)
      } catch (error) {
        this.logger.debug(
          { error },
          'Error while closing WebSocket — already closing',
        )
      }
    }
    this.logger.info(
      {
        userId: context.ticket.uid,
        durationMs: Date.now() - context.startedAtMs,
        bytesReceived: context.bytesReceived,
        reason,
      },
      'Speech-to-text session ended',
    )
  }

  private onSocketClosed(context: SessionContext) {
    if (context.closed) {
      return
    }
    context.closed = true
    clearInterval(context.heartbeatTimer)
    clearTimeout(context.warnTimer)
    clearTimeout(context.capTimer)
    for (const push of context.audioPushers) {
      push(null)
    }
    context.abortController.abort()
    this.logger.info(
      {
        userId: context.ticket.uid,
        durationMs: Date.now() - context.startedAtMs,
        bytesReceived: context.bytesReceived,
      },
      'Speech-to-text WebSocket closed by client',
    )
  }

  private sendEvent(socket: WebSocket, event: ServerEvent) {
    if (socket.readyState !== socket.OPEN) {
      return
    }
    socket.send(JSON.stringify(event))
  }

  private closeWithCode(
    socket: WebSocket,
    code: number,
    reason: string,
    message: string,
  ) {
    this.sendEvent(socket, {
      type: 'error',
      code: reason.toUpperCase(),
      message,
    })
    try {
      socket.close(code, reason)
    } catch (error) {
      this.logger.debug({ error }, 'Failed to close WebSocket cleanly')
    }
  }
}
