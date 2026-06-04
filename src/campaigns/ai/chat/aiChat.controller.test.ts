import { afterEach, describe, expect, it, vi } from 'vitest'
import { HttpStatus } from '@nestjs/common'
import { AiChatController } from './aiChat.controller'
import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import type { CampaignChatChunk } from './aiChat.types'
import type { PromptReplaceCampaign } from 'src/ai/services/promptReplace.service'
import type { StreamAiChatSchema } from './schemas/StreamAiChat.schema'

const CAMPAIGN = { id: 1, user: { id: 7 } } as unknown as PromptReplaceCampaign
const BODY = { message: 'hi', initial: true } as StreamAiChatSchema

const gen = (chunks: CampaignChatChunk[]) =>
  (async function* () {
    for (const c of chunks) yield c
  })()

const makeReply = () => ({
  raw: {
    writeHead: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    end: vi.fn(),
    once: vi.fn(),
    off: vi.fn(),
  },
})

const makeReq = () => {
  const handlers: Record<string, () => void> = {}
  return {
    raw: {
      once: vi.fn((event: string, cb: () => void) => {
        handlers[event] = cb
      }),
      off: vi.fn(),
    },
    fire: (event: string) => handlers[event]?.(),
  }
}

type StreamImpl = (
  ...args: unknown[]
) => AsyncGenerator<CampaignChatChunk, void, void>

const makeController = (streamImpl: StreamImpl) => {
  const streamChat = vi.fn(streamImpl)
  const aiChatService = { streamChat }
  const campaigns = {
    fetchLiveRaceTargetMetrics: vi.fn().mockResolvedValue(null),
  }
  const slack = {}
  const controller = new AiChatController(
    aiChatService as never,
    campaigns as never,
    slack as never,
    createMockLogger(),
  )
  return { controller, streamChat }
}

describe('AiChatController.stream', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens the SSE response and forwards every chunk, then ends', async () => {
    const { controller } = makeController(() =>
      gen([
        { type: 'text', delta: 'a' },
        {
          type: 'done',
          threadId: 't1',
          message: { role: 'assistant', content: 'a' },
        },
      ]),
    )
    const reply = makeReply()
    const req = makeReq()

    await controller.stream(CAMPAIGN, BODY, req as never, reply as never)

    expect(reply.raw.writeHead).toHaveBeenCalledWith(
      HttpStatus.OK,
      expect.objectContaining({ 'content-type': 'text/event-stream' }),
    )
    expect(reply.raw.write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"text"'),
    )
    expect(reply.raw.write).toHaveBeenCalledWith(
      expect.stringContaining('"type":"done"'),
    )
    expect(reply.raw.write).not.toHaveBeenCalledWith(
      expect.stringContaining('"type":"error"'),
    )
    expect(reply.raw.end).toHaveBeenCalledTimes(1)
  })

  it('writes a non-retryable internal error chunk when the iterator throws', async () => {
    const { controller } = makeController(() =>
      (async function* () {
        yield { type: 'text', delta: 'a' } as CampaignChatChunk
        throw new Error('boom')
      })(),
    )
    const reply = makeReply()
    const req = makeReq()

    await controller.stream(CAMPAIGN, BODY, req as never, reply as never)

    expect(reply.raw.write).toHaveBeenCalledWith(
      expect.stringContaining('Chat stream failed'),
    )
    expect(reply.raw.write).toHaveBeenCalledWith(
      expect.stringContaining('"retryable":false'),
    )
    expect(reply.raw.end).toHaveBeenCalledTimes(1)
  })

  it('aborts the stream signal when the client disconnects, and cleans up the listener', async () => {
    let captured: AbortSignal | undefined
    const { controller } = makeController((...args: unknown[]) => {
      captured = args[3] as AbortSignal
      return gen([
        { type: 'text', delta: 'a' },
        {
          type: 'done',
          threadId: 't1',
          message: { role: 'assistant', content: 'a' },
        },
      ])
    })
    const reply = makeReply()
    const req = makeReq()

    await controller.stream(CAMPAIGN, BODY, req as never, reply as never)

    expect(req.raw.once).toHaveBeenCalledWith('close', expect.any(Function))
    expect(req.raw.off).toHaveBeenCalledWith('close', expect.any(Function))
    expect(captured?.aborted).toBe(false)
    req.fire('close')
    expect(captured?.aborted).toBe(true)
  })

  it('forwards a service-yielded error chunk without writing a duplicate internal chunk', async () => {
    const { controller } = makeController(() =>
      gen([
        { type: 'text', delta: 'a' },
        {
          type: 'error',
          code: 'upstream_unavailable',
          message: 'Service error.',
          retryable: true,
        },
      ]),
    )
    const reply = makeReply()
    const req = makeReq()

    await controller.stream(CAMPAIGN, BODY, req as never, reply as never)

    expect(reply.raw.write).toHaveBeenCalledWith(
      expect.stringContaining('Service error.'),
    )
    expect(reply.raw.write).not.toHaveBeenCalledWith(
      expect.stringContaining('Chat stream failed'),
    )
    expect(reply.raw.end).toHaveBeenCalledTimes(1)
  })

  it('cleans up the close listener and bails when writeHead throws', async () => {
    const { controller, streamChat } = makeController(() =>
      gen([{ type: 'text', delta: 'a' }]),
    )
    const reply = makeReply()
    reply.raw.writeHead = vi.fn(() => {
      throw new Error('socket destroyed')
    })
    const req = makeReq()

    await controller.stream(CAMPAIGN, BODY, req as never, reply as never)

    expect(req.raw.off).toHaveBeenCalledWith('close', expect.any(Function))
    expect(streamChat).not.toHaveBeenCalled()
    expect(reply.raw.end).not.toHaveBeenCalled()
  })

  it('writes a timeout error chunk when the stream exceeds the deadline', async () => {
    vi.useFakeTimers()
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { controller } = makeController(async function* () {
      yield { type: 'text', delta: 'a' } as CampaignChatChunk
      await gate
      yield {
        type: 'done',
        threadId: 't1',
        message: { role: 'assistant', content: 'a' },
      } as CampaignChatChunk
    })
    const reply = makeReply()
    const req = makeReq()

    const pending = controller.stream(
      CAMPAIGN,
      BODY,
      req as never,
      reply as never,
    )
    // Advance past the 5-minute stream deadline while the generator is blocked.
    await vi.advanceTimersByTimeAsync(300_000)
    release()
    await pending

    expect(reply.raw.write).toHaveBeenCalledWith(
      expect.stringContaining('Response took too long'),
    )
    expect(reply.raw.end).toHaveBeenCalledTimes(1)
  })
})
