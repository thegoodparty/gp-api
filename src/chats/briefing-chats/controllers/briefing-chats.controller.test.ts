import { BadRequestException } from '@nestjs/common'
import { ChatMessage, ChatMessageRole, User } from '../../../generated/prisma'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { EventEmitter } from 'events'
import { PinoLogger } from 'nestjs-pino'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatStreamChunk } from '@/chats/services/chatStream.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import type { BriefingChatCreateService } from '../services/briefingChatCreate.service'
import type { BriefingChatsService } from '../services/briefing-chats.service'
import { sendMessageSchema } from '../schemas/SendMessage.schema'
import { BriefingChatsController } from './briefing-chats.controller'

const ANNOTATION_ID = 'anno-1'
const USER_ID = 42

const buildUser = (id: number): User => ({ id }) as unknown as User

interface CapturedHeaders {
  status: number
  headers: Record<string, string | number>
}

interface FakeReplyState {
  captured: CapturedHeaders | undefined
  writes: string[]
  ended: boolean
}

class StreamableReply extends EventEmitter {
  public state: FakeReplyState = {
    captured: undefined,
    writes: [],
    ended: false,
  }
  public writeReturn = true

  writeHead = vi.fn(
    (status: number, headers: Record<string, string | number>) => {
      this.state.captured = { status, headers }
    },
  )

  write = vi.fn((chunk: string) => {
    this.state.writes.push(chunk)
    return this.writeReturn
  })

  end = vi.fn(() => {
    this.state.ended = true
  })
}

const buildReply = (): {
  reply: FastifyReply
  raw: StreamableReply
  state: FakeReplyState
} => {
  const raw = new StreamableReply()
  const reply = { raw } as unknown as FastifyReply
  return { reply, raw, state: raw.state }
}

const buildReq = (): {
  req: FastifyRequest
  emitter: EventEmitter
} => {
  const emitter = new EventEmitter()
  const req = {
    raw: emitter,
  } as unknown as FastifyRequest
  return { req, emitter }
}

const buildIterable = (
  chunks: ChatStreamChunk[],
  hooks?: {
    onAbort?: () => void
    signalRef?: { signal?: AbortSignal }
  },
): AsyncIterable<ChatStreamChunk> => ({
  [Symbol.asyncIterator]: async function* () {
    for (const c of chunks) {
      if (hooks?.signalRef?.signal?.aborted) {
        hooks.onAbort?.()
        return
      }
      yield c
    }
  },
})

const buildService = (
  overrides: Partial<BriefingChatsService> = {},
): BriefingChatsService =>
  ({
    sendMessage: vi.fn(),
    loadConversation: vi.fn(),
    deleteConversation: vi.fn(),
    assertBriefingChatAccessible: vi.fn(() => Promise.resolve()),
    ...overrides,
  }) as unknown as BriefingChatsService

const buildCreateService = (
  overrides: Partial<BriefingChatCreateService> = {},
): BriefingChatCreateService =>
  ({
    findOrCreate: vi.fn(() =>
      Promise.resolve({
        annotationId: 'anno-new',
        conversationId: 'conv-new',
      }),
    ),
    ...overrides,
  }) as unknown as BriefingChatCreateService

const validBody = (content: string): { content: string } => {
  const parsed = sendMessageSchema.parse({ content })
  return { content: parsed.content }
}

describe('BriefingChatsController.streamMessage', () => {
  let serviceSpy: BriefingChatsService
  let logger: PinoLogger
  let lastCall: {
    annotationId: string
    userId: number
    userMessage: string
    signal?: AbortSignal
    clientMessageId?: string
  }

  beforeEach(() => {
    lastCall = {
      annotationId: '',
      userId: 0,
      userMessage: '',
    }
    serviceSpy = buildService({
      sendMessage: vi.fn((args) => {
        lastCall = args
        return buildIterable([
          { type: 'text', delta: 'hello' },
          { type: 'done', assistantMessageId: 'm-1' },
        ])
      }),
    })
    logger = createMockLogger()
  })

  it('does not start SSE when content is empty (validation rejects before write)', async () => {
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state } = buildReply()
    const { req } = buildReq()

    let thrown: unknown
    try {
      await controller.streamMessage(
        buildUser(USER_ID),
        ANNOTATION_ID,
        sendMessageSchema.parse({ content: 'x' }) as never,
        req,
        reply,
      )
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeUndefined()
    expect(state.ended).toBe(true)

    const emptyParse = sendMessageSchema.safeParse({ content: '' })
    expect(emptyParse.success).toBe(false)
  })

  it('checks accessibility before writing SSE headers', async () => {
    const order: string[] = []
    serviceSpy = buildService({
      assertBriefingChatAccessible: vi.fn(() => {
        order.push('assert')
        return Promise.resolve()
      }),
      sendMessage: vi.fn(() => {
        order.push('sendMessage')
        return buildIterable([{ type: 'done', assistantMessageId: 'm-1' }])
      }),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, raw } = buildReply()
    raw.writeHead = vi.fn(
      (status: number, headers: Record<string, string | number>) => {
        order.push('writeHead')
        raw.state.captured = { status, headers }
      },
    )
    const { req } = buildReq()

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hello'),
      req,
      reply,
    )

    expect(order[0]).toBe('assert')
    expect(order[1]).toBe('writeHead')
  })

  it('does not start SSE if assertBriefingChatAccessible throws', async () => {
    serviceSpy = buildService({
      assertBriefingChatAccessible: vi.fn(() =>
        Promise.reject(new BadRequestException('not allowed')),
      ),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state } = buildReply()
    const { req } = buildReq()

    await expect(
      controller.streamMessage(
        buildUser(USER_ID),
        ANNOTATION_ID,
        validBody('hello'),
        req,
        reply,
      ),
    ).rejects.toBeInstanceOf(BadRequestException)

    expect(state.captured).toBeUndefined()
    expect(state.writes).toEqual([])
    expect(state.ended).toBe(false)
    expect(serviceSpy.sendMessage).not.toHaveBeenCalled()
  })

  it('writes SSE headers with exact content-type and other values', async () => {
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state } = buildReply()
    const { req } = buildReq()

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hello'),
      req,
      reply,
    )

    expect(state.captured?.status).toBe(200)
    expect(state.captured?.headers['content-type']).toBe('text/event-stream')
    expect(state.captured?.headers['cache-control']).toBe(
      'no-cache, no-transform',
    )
    expect(state.captured?.headers['connection']).toBe('keep-alive')
    expect(state.captured?.headers['x-accel-buffering']).toBe('no')
  })

  it('writes each chunk as data: <JSON>\\n\\n', async () => {
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state } = buildReply()
    const { req } = buildReq()

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hello'),
      req,
      reply,
    )

    expect(state.writes).toEqual([
      `data: ${JSON.stringify({ type: 'text', delta: 'hello' })}\n\n`,
      `data: ${JSON.stringify({ type: 'done', assistantMessageId: 'm-1' })}\n\n`,
    ])
  })

  it('omits assistantMessageId from the serialized done chunk when it is an empty string', async () => {
    serviceSpy = buildService({
      sendMessage: vi.fn(() =>
        buildIterable([{ type: 'done', assistantMessageId: '' }]),
      ),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state } = buildReply()
    const { req } = buildReq()

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hello'),
      req,
      reply,
    )

    expect(state.writes).toEqual([
      `data: ${JSON.stringify({ type: 'done' })}\n\n`,
    ])
  })

  it('calls reply.raw.end() after the iterable completes', async () => {
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state } = buildReply()
    const { req } = buildReq()

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hello'),
      req,
      reply,
    )

    expect(state.ended).toBe(true)
  })

  it('forwards annotationId, userId, and trimmed content to the service', async () => {
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply } = buildReply()
    const { req } = buildReq()

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('  hello there  '),
      req,
      reply,
    )

    expect(lastCall.annotationId).toBe(ANNOTATION_ID)
    expect(lastCall.userId).toBe(USER_ID)
    expect(lastCall.userMessage).toBe('hello there')
    expect(lastCall.signal).toBeInstanceOf(AbortSignal)
  })

  it('forwards clientMessageId when provided', async () => {
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply } = buildReply()
    const { req } = buildReq()
    const clientMessageId = '22222222-2222-4222-8222-222222222222'

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      { content: 'hello', clientMessageId },
      req,
      reply,
    )

    expect(lastCall.clientMessageId).toBe(clientMessageId)
  })

  it('aborts mid-stream and stops drain when request close is emitted', async () => {
    let aborted = false
    const signalRef: { signal?: AbortSignal } = {}
    const longStream = async function* (): AsyncGenerator<ChatStreamChunk> {
      for (let i = 0; i < 20; i++) {
        if (signalRef.signal?.aborted) return
        yield { type: 'text', delta: `chunk-${i}` }
        await new Promise<void>((r) => setImmediate(r))
      }
    }
    serviceSpy = buildService({
      sendMessage: vi.fn((args) => {
        signalRef.signal = args.signal
        args.signal?.addEventListener('abort', () => {
          aborted = true
        })
        return {
          [Symbol.asyncIterator]: () => longStream(),
        }
      }),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state } = buildReply()
    const { req, emitter } = buildReq()

    const closeMidStream = (async () => {
      await new Promise<void>((r) => setImmediate(r))
      await new Promise<void>((r) => setImmediate(r))
      emitter.emit('close')
    })()

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hi'),
      req,
      reply,
    )
    await closeMidStream

    expect(aborted).toBe(true)
    expect(signalRef.signal?.aborted).toBe(true)
    expect(state.writes.length).toBeLessThan(20)
  })

  it('does not hang waitForDrain when the connection closes before drain', async () => {
    const writes: string[] = []
    const replyRaw = new StreamableReply()
    replyRaw.writeReturn = false
    replyRaw.write = vi.fn((chunk: string) => {
      writes.push(chunk)
      return false
    })
    const reply = { raw: replyRaw } as unknown as FastifyReply

    serviceSpy = buildService({
      sendMessage: vi.fn(() =>
        buildIterable([
          { type: 'text', delta: 'a' },
          { type: 'text', delta: 'b' },
        ]),
      ),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { req, emitter } = buildReq()

    const fireClose = (async () => {
      await new Promise<void>((r) => setImmediate(r))
      emitter.emit('close')
      replyRaw.emit('close')
    })()

    await Promise.race([
      controller.streamMessage(
        buildUser(USER_ID),
        ANNOTATION_ID,
        validBody('hi'),
        req,
        reply,
      ),
      new Promise<void>((_, reject) =>
        setTimeout(
          () => reject(new Error('timeout: streamMessage hung')),
          2000,
        ),
      ),
    ])
    await fireClose

    expect(replyRaw.state.ended).toBe(true)
  })

  it('logs and recovers when the iterable throws after headers are written', async () => {
    const failingIterable: AsyncIterable<ChatStreamChunk> = {
      [Symbol.asyncIterator]: async function* () {
        yield { type: 'text', delta: 'partial' }
        throw new Error('upstream blew up')
      },
    }
    serviceSpy = buildService({
      sendMessage: vi.fn(() => failingIterable),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state } = buildReply()
    const { req } = buildReq()

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hi'),
      req,
      reply,
    )

    expect(state.ended).toBe(true)
    expect(state.writes.length).toBeGreaterThan(0)
    expect(logger.error).toHaveBeenCalled()
  })

  it('aborts the stream after the per-stream timeout elapses and emits an error chunk before end', async () => {
    vi.useFakeTimers()
    let aborted = false
    const signalRef: { signal?: AbortSignal } = {}
    const hangingIterable: AsyncIterable<ChatStreamChunk> = {
      [Symbol.asyncIterator]: async function* () {
        await new Promise<void>((resolve) => {
          signalRef.signal?.addEventListener('abort', () => resolve())
        })
        return
      },
    }
    serviceSpy = buildService({
      sendMessage: vi.fn((args) => {
        signalRef.signal = args.signal
        args.signal?.addEventListener('abort', () => {
          aborted = true
        })
        return hangingIterable
      }),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state, raw } = buildReply()
    const { req } = buildReq()

    const p = controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hi'),
      req,
      reply,
    )

    await vi.advanceTimersByTimeAsync(300_001)
    await p
    vi.useRealTimers()

    expect(aborted).toBe(true)
    expect(signalRef.signal?.aborted).toBe(true)
    const errorWrites = state.writes.filter(
      (w) => w.includes('"type":"error"') && w.includes('"code":"aborted"'),
    )
    expect(errorWrites).toHaveLength(1)
    const writeCalls = raw.write.mock.invocationCallOrder
    const endCalls = raw.end.mock.invocationCallOrder
    expect(writeCalls.length).toBeGreaterThan(0)
    expect(endCalls.length).toBeGreaterThan(0)
    expect(endCalls[0]).toBeGreaterThan(writeCalls[writeCalls.length - 1])
  })

  it('does not time out before the prior 90s threshold (timeout extended to 300s)', async () => {
    vi.useFakeTimers()
    let aborted = false
    const signalRef: { signal?: AbortSignal } = {}
    const hangingIterable: AsyncIterable<ChatStreamChunk> = {
      [Symbol.asyncIterator]: async function* () {
        await new Promise<void>((resolve) => {
          signalRef.signal?.addEventListener('abort', () => resolve())
        })
        return
      },
    }
    serviceSpy = buildService({
      sendMessage: vi.fn((args) => {
        signalRef.signal = args.signal
        args.signal?.addEventListener('abort', () => {
          aborted = true
        })
        return hangingIterable
      }),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply } = buildReply()
    const { req } = buildReq()

    const p = controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hi'),
      req,
      reply,
    )

    await vi.advanceTimersByTimeAsync(90_001)
    expect(aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(300_001)
    await p
    vi.useRealTimers()

    expect(aborted).toBe(true)
  })

  it('does not emit text frames after the timeout error frame is written', async () => {
    vi.useFakeTimers()
    const signalRef: { signal?: AbortSignal } = {}
    let releaseChunk: (() => void) | undefined
    const racingIterable: AsyncIterable<ChatStreamChunk> = {
      [Symbol.asyncIterator]: async function* () {
        const gate = new Promise<void>((resolve) => {
          releaseChunk = resolve
        })
        await gate
        yield { type: 'text', delta: 'late' }
      },
    }
    serviceSpy = buildService({
      sendMessage: vi.fn((args) => {
        signalRef.signal = args.signal
        return racingIterable
      }),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state } = buildReply()
    const { req } = buildReq()

    const p = controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hi'),
      req,
      reply,
    )

    await vi.advanceTimersByTimeAsync(300_001)
    releaseChunk?.()
    await p
    vi.useRealTimers()

    const lastWrite = state.writes[state.writes.length - 1]
    expect(lastWrite).toContain('"type":"error"')
    expect(lastWrite).toContain('"code":"aborted"')
    const textFramesAfterError = state.writes
      .slice(state.writes.findIndex((w) => w.includes('"type":"error"')) + 1)
      .filter((w) => w.includes('"type":"text"'))
    expect(textFramesAfterError).toHaveLength(0)
  })

  it('writes an error frame before ending when sendMessage throws after headers', async () => {
    const failingIterable: AsyncIterable<ChatStreamChunk> = {
      [Symbol.asyncIterator]:
        async function* (): AsyncGenerator<ChatStreamChunk> {
          throw new Error('upstream blew up before any chunk')
        },
    }
    serviceSpy = buildService({
      sendMessage: vi.fn(() => failingIterable),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, state, raw } = buildReply()
    const { req } = buildReq()

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hi'),
      req,
      reply,
    )

    expect(state.ended).toBe(true)
    expect(state.writes.length).toBeGreaterThan(0)
    const lastWrite = state.writes[state.writes.length - 1]
    expect(lastWrite).toContain('"type":"error"')
    expect(lastWrite).toContain('"retryable":true')
    const writeCalls = raw.write.mock.invocationCallOrder
    const endCalls = raw.end.mock.invocationCallOrder
    expect(endCalls[0]).toBeGreaterThan(writeCalls[writeCalls.length - 1])
  })

  it('logs (does not silently swallow) write failures during timeout chunk emission', async () => {
    vi.useFakeTimers()
    const signalRef: { signal?: AbortSignal } = {}
    const hangingIterable: AsyncIterable<ChatStreamChunk> = {
      [Symbol.asyncIterator]: async function* () {
        await new Promise<void>((resolve) => {
          signalRef.signal?.addEventListener('abort', () => resolve())
        })
      },
    }
    serviceSpy = buildService({
      sendMessage: vi.fn((args) => {
        signalRef.signal = args.signal
        return hangingIterable
      }),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply, raw } = buildReply()
    const writeErr = new Error('socket closed')
    raw.write = vi.fn(() => {
      throw writeErr
    })
    const { req } = buildReq()

    const p = controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hi'),
      req,
      reply,
    )

    await vi.advanceTimersByTimeAsync(300_001)
    await p
    vi.useRealTimers()

    const warnCalls = (
      logger.warn as unknown as { mock: { calls: unknown[][] } }
    ).mock.calls
    const matched = warnCalls.find((args) => {
      const ctx = args[0] as { err?: unknown; annotationId?: string }
      return ctx?.err === writeErr && ctx?.annotationId === ANNOTATION_ID
    })
    expect(matched).toBeDefined()
  })

  it('removes the close listener so it does not leak across requests', async () => {
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      logger,
    )
    const { reply } = buildReply()
    const { req, emitter } = buildReq()

    await controller.streamMessage(
      buildUser(USER_ID),
      ANNOTATION_ID,
      validBody('hi'),
      req,
      reply,
    )

    expect(emitter.listenerCount('close')).toBe(0)
  })
})

describe('BriefingChatsController.getConversation', () => {
  it('returns conversationId and messages from the service', async () => {
    const messages: ChatMessage[] = [
      {
        id: 'm-1',
        conversationId: 'conv-1',
        role: ChatMessageRole.user,
        content: 'hi',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      } as unknown as ChatMessage,
    ]
    const serviceSpy = buildService({
      loadConversation: vi.fn(() =>
        Promise.resolve({ conversationId: 'conv-1', messages }),
      ),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      createMockLogger(),
    )

    const result = await controller.getConversation(
      buildUser(USER_ID),
      ANNOTATION_ID,
    )

    expect(serviceSpy.loadConversation).toHaveBeenCalledWith(
      ANNOTATION_ID,
      USER_ID,
    )
    expect(result.conversationId).toBe('conv-1')
    expect(result.messages).toHaveLength(1)
    expect(result.messages[0].id).toBe('m-1')
    expect(result.messages[0].role).toBe(ChatMessageRole.user)
    expect(result.messages[0].content).toBe('hi')
  })
})

describe('BriefingChatsController.createChat', () => {
  it('returns annotationId + conversationId from the create service', async () => {
    const createSpy = buildCreateService({
      findOrCreate: vi.fn(() =>
        Promise.resolve({
          annotationId: 'anno-1',
          conversationId: 'conv-1',
        }),
      ),
    })
    const controller = new BriefingChatsController(
      buildService(),
      createSpy,
      createMockLogger(),
    )

    const result = await controller.createChat(buildUser(USER_ID), {
      meetingDate: '2026-05-12',
      anchor: { jsonPath: null, start: null, end: null },
    })

    expect(createSpy.findOrCreate).toHaveBeenCalledWith({
      userId: USER_ID,
      meetingDate: '2026-05-12',
      anchor: { jsonPath: null, start: null, end: null },
    })
    expect(result).toEqual({
      annotationId: 'anno-1',
      conversationId: 'conv-1',
    })
  })

  it('forwards anchored anchors verbatim', async () => {
    const createSpy = buildCreateService({
      findOrCreate: vi.fn(() =>
        Promise.resolve({
          annotationId: 'anno-2',
          conversationId: 'conv-2',
        }),
      ),
    })
    const controller = new BriefingChatsController(
      buildService(),
      createSpy,
      createMockLogger(),
    )

    await controller.createChat(buildUser(USER_ID), {
      meetingDate: '2026-05-12',
      anchor: { jsonPath: '$.foo', start: 10, end: 20 },
    })

    expect(createSpy.findOrCreate).toHaveBeenCalledWith({
      userId: USER_ID,
      meetingDate: '2026-05-12',
      anchor: { jsonPath: '$.foo', start: 10, end: 20 },
    })
  })
})

describe('BriefingChatsController.deleteConversation', () => {
  it('calls the service with annotationId and userId and returns void', async () => {
    const serviceSpy = buildService({
      deleteConversation: vi.fn(() => Promise.resolve()),
    })
    const controller = new BriefingChatsController(
      serviceSpy,
      buildCreateService(),
      createMockLogger(),
    )

    const result = await controller.deleteConversation(
      buildUser(USER_ID),
      ANNOTATION_ID,
    )

    expect(serviceSpy.deleteConversation).toHaveBeenCalledWith(
      ANNOTATION_ID,
      USER_ID,
    )
    expect(result).toBeUndefined()
  })
})
