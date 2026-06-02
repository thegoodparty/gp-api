import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import type { LlmStreamResult } from '@/llm/services/llm.service'
import { AiChatService } from './aiChat.service'
import type { PromptReplaceCampaign } from 'src/ai/services/promptReplace.service'
import type { CampaignChatChunk } from './aiChat.types'
import type { StreamAiChatSchema } from './schemas/StreamAiChat.schema'
import type { CreateAiChatSchema } from './schemas/CreateAiChat.schema'

const CAMPAIGN = {
  id: 10,
  user: { id: 7 },
} as unknown as PromptReplaceCampaign

function makeStreamResult(deltas: string[]): LlmStreamResult {
  return {
    textStream: (async function* () {
      for (const d of deltas) yield d
    })(),
    finalText: Promise.resolve(deltas.join('')),
    toolCalls: Promise.resolve([]),
    usage: Promise.resolve({ inputTokens: 0, outputTokens: 0, totalTokens: 0 }),
    model: 'test-model',
  }
}

async function collect(
  iter: AsyncIterable<CampaignChatChunk>,
): Promise<CampaignChatChunk[]> {
  const out: CampaignChatChunk[] = []
  for await (const chunk of iter) out.push(chunk)
  return out
}

const asBody = (body: Partial<StreamAiChatSchema>): StreamAiChatSchema =>
  ({ initial: false, regenerate: false, ...body }) as StreamAiChatSchema

describe('AiChatService.streamChat', () => {
  let service: AiChatService
  let streamChatCompletion: ReturnType<typeof vi.fn>
  let chatCompletion: ReturnType<typeof vi.fn>
  let fakeModel: {
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    findFirstOrThrow: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    streamChatCompletion = vi.fn()
    chatCompletion = vi.fn()
    const llm = { streamChatCompletion, chatCompletion }
    const promptReplace = { promptReplace: vi.fn().mockResolvedValue('CTX') }
    const content = {
      getChatSystemPrompt: vi
        .fn()
        .mockResolvedValue({ candidateJson: '{}', systemPrompt: 'SYS' }),
    }
    const slack = {}

    service = new AiChatService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      llm as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      promptReplace as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      content as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      slack as any,
    )

    fakeModel = {
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      findFirstOrThrow: vi.fn(),
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(service as any)._prisma = { aiChat: fakeModel }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(service as any).logger = createMockLogger()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(service as any).findFirstOrThrow = fakeModel.findFirstOrThrow
  })

  it('streams text deltas and persists a new thread on the first message', async () => {
    streamChatCompletion.mockResolvedValue(
      makeStreamResult(['Hello', ' world']),
    )

    const chunks = await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ message: 'hi', initial: true }),
        null,
      ),
    )

    expect(chunks[0]).toEqual({ type: 'text', delta: 'Hello' })
    expect(chunks[1]).toEqual({ type: 'text', delta: ' world' })
    const done = chunks[2]
    expect(done?.type).toBe('done')
    if (done?.type === 'done') {
      expect(done.message.content).toBe('Hello world')
      expect(done.threadId).toBeTruthy()
    }

    expect(fakeModel.create).toHaveBeenCalledTimes(1)
    expect(fakeModel.update).not.toHaveBeenCalled()
    const createArg = fakeModel.create.mock.calls[0][0]
    expect(createArg.data.campaignId).toBe(10)
    expect(createArg.data.userId).toBe(7)
    expect(createArg.data.data.messages).toHaveLength(2)
    expect(createArg.data.data.messages[0]).toMatchObject({
      role: 'user',
      content: 'hi',
    })
    expect(createArg.data.data.messages[1]).toMatchObject({
      role: 'assistant',
      content: 'Hello world',
    })
  })

  it('uses streamChatCompletion with the bumped output token budget', async () => {
    streamChatCompletion.mockResolvedValue(makeStreamResult(['ok']))

    await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ message: 'hi', initial: true }),
        null,
      ),
    )

    expect(streamChatCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ maxOutputTokens: 2000 }),
    )
  })

  it('instructs the model to respond in Markdown (overriding CMS HTML guidance)', async () => {
    streamChatCompletion.mockResolvedValue(makeStreamResult(['ok']))

    await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ message: 'hi', initial: true }),
        null,
      ),
    )

    const messages = streamChatCompletion.mock.calls[0][0].messages
    expect(messages[0].role).toBe('system')
    expect(messages[0].content).toMatch(/Markdown/i)
    expect(messages[0].content).toMatch(/do not output raw HTML/i)
  })

  it('stores raw Markdown (no HTML post-processing) on the create path', async () => {
    // All paths share the AiChat store, so the non-streaming create path must
    // also emit the Markdown directive and store raw Markdown — not HTML with
    // <br/> conversions — to avoid mixed-format threads.
    chatCompletion.mockResolvedValue({
      content: 'line one\nline two',
      tokens: 5,
    })

    await service.create(
      CAMPAIGN,
      { message: 'hi', initial: true } as CreateAiChatSchema,
      null,
    )

    const sent = chatCompletion.mock.calls[0][0].messages
    expect(sent[0].role).toBe('system')
    expect(sent[0].content).toMatch(/Markdown/i)

    const storedAssistant =
      fakeModel.create.mock.calls[0][0].data.data.messages[1]
    expect(storedAssistant.content).toBe('line one\nline two')
    expect(storedAssistant.content).not.toContain('<br')
  })

  it('appends to an existing thread on a follow-up message', async () => {
    fakeModel.findFirstOrThrow.mockResolvedValue({
      id: 5,
      data: {
        messages: [
          { role: 'user', content: 'q1', id: 'u1' },
          { role: 'assistant', content: 'a1', id: 'a1' },
        ],
      },
    })
    streamChatCompletion.mockResolvedValue(makeStreamResult(['resp']))

    const chunks = await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ threadId: 't1', message: 'q2' }),
        null,
      ),
    )

    expect(chunks.at(-1)?.type).toBe('done')
    // The thread lookup is scoped to the campaign as well, so a thread from a
    // different campaign owned by the same user can't be continued here.
    expect(fakeModel.findFirstOrThrow).toHaveBeenCalledWith({
      where: { threadId: 't1', userId: 7, campaignId: 10 },
    })
    expect(fakeModel.create).not.toHaveBeenCalled()
    expect(fakeModel.update).toHaveBeenCalledTimes(1)
    const updateArg = fakeModel.update.mock.calls[0][0]
    expect(updateArg.where).toEqual({ id: 5 })
    const messages = updateArg.data.data.messages
    expect(messages).toHaveLength(4)
    expect(messages[2]).toMatchObject({ role: 'user', content: 'q2' })
    expect(messages[3]).toMatchObject({ role: 'assistant', content: 'resp' })
  })

  it('strips legacy HTML from prior assistant messages before replaying history', async () => {
    fakeModel.findFirstOrThrow.mockResolvedValue({
      id: 5,
      data: {
        messages: [
          { role: 'user', content: 'q1', id: 'u1' },
          {
            role: 'assistant',
            content: 'line1<br/><br/><b>line2</b>',
            id: 'a1',
          },
        ],
      },
    })
    streamChatCompletion.mockResolvedValue(makeStreamResult(['ok']))

    await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ threadId: 't1', message: 'q2' }),
        null,
      ),
    )

    const sent = streamChatCompletion.mock.calls[0][0].messages
    const priorAssistant = sent.find(
      (m: { role: string }) => m.role === 'assistant',
    )
    expect(priorAssistant.content).toBe('line1\n\nline2')
    expect(priorAssistant.content).not.toMatch(/<[^>]*>|<br/)
  })

  it('re-sends the last user message and replaces the assistant reply on regenerate', async () => {
    fakeModel.findFirstOrThrow.mockResolvedValue({
      id: 9,
      data: {
        messages: [
          { role: 'user', content: 'first question', id: 'u1' },
          { role: 'assistant', content: 'original reply', id: 'a1' },
        ],
      },
    })
    streamChatCompletion.mockResolvedValue(makeStreamResult(['new reply']))

    const chunks = await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ threadId: 't1', regenerate: true }),
        null,
      ),
    )

    expect(chunks.at(-1)?.type).toBe('done')
    const updateArg = fakeModel.update.mock.calls[0][0]
    const messages = updateArg.data.data.messages
    expect(messages).toHaveLength(2)
    expect(messages[0]).toMatchObject({
      role: 'user',
      content: 'first question',
    })
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: 'new reply',
    })
  })

  it('yields a retryable error and skips persistence when the upstream connection fails', async () => {
    streamChatCompletion.mockRejectedValue(
      Object.assign(new Error('503 upstream'), { status: 503 }),
    )

    const chunks = await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ message: 'hi', initial: true }),
        null,
      ),
    )

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({
      type: 'error',
      code: 'upstream_unavailable',
      retryable: true,
    })
    expect(fakeModel.create).not.toHaveBeenCalled()
  })

  it('emits a non-retryable aborted error and skips persistence when the signal is aborted', async () => {
    streamChatCompletion.mockResolvedValue(
      makeStreamResult(['partial', ' text']),
    )
    const controller = new AbortController()
    controller.abort()

    const chunks = await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ message: 'hi', initial: true }),
        null,
        controller.signal,
      ),
    )

    expect(chunks.at(-1)).toMatchObject({
      type: 'error',
      code: 'aborted',
      retryable: false,
    })
    // The aborted-signal guard must fire before any delta is emitted — no
    // partial text should leak ahead of the abort error.
    expect(chunks.every((c) => c.type !== 'text')).toBe(true)
    expect(fakeModel.create).not.toHaveBeenCalled()
    expect(fakeModel.update).not.toHaveBeenCalled()
  })

  it('yields a retryable rate_limited error when the upstream is throttled', async () => {
    streamChatCompletion.mockRejectedValue(
      Object.assign(new Error('429 too many requests'), { status: 429 }),
    )

    const chunks = await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ message: 'hi', initial: true }),
        null,
      ),
    )

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({
      type: 'error',
      code: 'rate_limited',
      retryable: true,
    })
    expect(fakeModel.create).not.toHaveBeenCalled()
  })

  it('emits an internal error when persisting the streamed exchange fails', async () => {
    streamChatCompletion.mockResolvedValue(makeStreamResult(['ok']))
    fakeModel.create.mockRejectedValue(new Error('db down'))

    const chunks = await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ message: 'hi', initial: true }),
        null,
      ),
    )

    expect(chunks.some((c) => c.type === 'text')).toBe(true)
    expect(chunks.at(-1)).toMatchObject({ type: 'error', code: 'internal' })
  })

  it('errors when the campaign has no associated user', async () => {
    const chunks = await collect(
      service.streamChat(
        { id: 1 } as unknown as PromptReplaceCampaign,
        asBody({ message: 'hi', initial: true }),
        null,
      ),
    )

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({ type: 'error', code: 'internal' })
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })

  it('errors with a non-retryable internal error when the thread lookup fails', async () => {
    fakeModel.findFirstOrThrow.mockRejectedValue(new Error('Not found'))

    const chunks = await collect(
      service.streamChat(
        CAMPAIGN,
        asBody({ threadId: 'missing-thread', message: 'hi' }),
        null,
      ),
    )

    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toMatchObject({
      type: 'error',
      code: 'internal',
      message: 'Chat thread is unavailable.',
      retryable: false,
    })
    expect(streamChatCompletion).not.toHaveBeenCalled()
  })
})
