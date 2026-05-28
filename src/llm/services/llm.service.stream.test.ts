import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import type { OpenAICompatibleProvider } from '@ai-sdk/openai-compatible'
import {
  LlmService,
  type AiSdkProviderFactory,
  type AnthropicProviderFactory,
  type OpenAIClientFactory,
  type OpenAIClientLike,
  type StreamTextFn,
} from './llm.service'

const noopProviderFactory: AiSdkProviderFactory = () =>
  ({
    chatModel: (model: string) =>
      ({
        modelId: model,
      }) as never,
  }) as unknown as OpenAICompatibleProvider

const stubClientFactory: OpenAIClientFactory = (): OpenAIClientLike => ({
  chat: {
    completions: {
      create: vi.fn(),
    },
  },
  baseURL: 'https://api.together.xyz/v1',
})

const USER_MSG = { role: 'user' as const, content: 'Hi' }

const fakeTextStream = (chunks: string[]): AsyncIterable<string> => ({
  async *[Symbol.asyncIterator]() {
    for (const c of chunks) yield c
  },
})

const fakeStreamResult = (
  overrides: {
    chunks?: string[]
    finalText?: string
    inputTokens?: number
    outputTokens?: number
    toolCalls?: Array<{
      toolCallId: string
      toolName: string
      input: unknown
    }>
  } = {},
): unknown => {
  const chunks = overrides.chunks ?? ['ok']
  const finalText = overrides.finalText ?? chunks.join('')
  const inputTokens = overrides.inputTokens ?? 1
  const outputTokens = overrides.outputTokens ?? 1
  return {
    textStream: fakeTextStream(chunks),
    text: Promise.resolve(finalText),
    usage: Promise.resolve({
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    }),
    totalUsage: Promise.resolve({
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    }),
    toolCalls: Promise.resolve(overrides.toolCalls ?? []),
  }
}

const buildStreamService = (): {
  service: LlmService
  streamTextFn: ReturnType<typeof vi.fn>
} => {
  const streamTextFn = vi.fn()
  const fakeStream = streamTextFn as unknown as StreamTextFn
  const service = new LlmService(
    createMockLogger(),
    fakeStream,
    stubClientFactory,
    noopProviderFactory,
  )
  return { service, streamTextFn }
}

describe('LlmService.streamChatCompletion', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.TOGETHER_AI_KEY = 'test-api-key'
    process.env.AI_MODELS = 'model1,model2,model3'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('yields text deltas through textStream and resolves finalText', async () => {
    const { service, streamTextFn } = buildStreamService()
    streamTextFn.mockReturnValueOnce(
      fakeStreamResult({
        chunks: ['Hello', ' ', 'world'],
        finalText: 'Hello world',
        inputTokens: 5,
        outputTokens: 3,
      }),
    )

    const result = await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['m1'],
      retries: 0,
    })

    const chunks: string[] = []
    for await (const c of result.textStream) chunks.push(c)

    expect(chunks).toEqual(['Hello', ' ', 'world'])
    expect(await result.finalText).toBe('Hello world')
    expect(result.model).toBe('m1')

    const usage = await result.usage
    expect(usage).toEqual({
      inputTokens: 5,
      outputTokens: 3,
      totalTokens: 8,
    })
  })

  it('forwards messages, abortSignal, sampling, and userId header to streamText', async () => {
    const { service, streamTextFn } = buildStreamService()
    streamTextFn.mockReturnValueOnce(fakeStreamResult())
    const controller = new AbortController()

    await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['m1'],
      retries: 0,
      abortSignal: controller.signal,
      temperature: 0.5,
      maxOutputTokens: 256,
      maxSteps: 3,
      userId: 'u-42',
    })

    const call = streamTextFn.mock.calls[0][0]
    expect(call.messages).toEqual([{ role: 'user', content: 'Hi' }])
    expect(call.abortSignal).toBe(controller.signal)
    expect(call.temperature).toBe(0.5)
    expect(call.maxOutputTokens).toBe(256)
    expect(call.headers).toMatchObject({ 'X-User-Id': 'u-42' })
  })

  it('maps Vercel-style tool calls into the facade ToolCall shape', async () => {
    const { service, streamTextFn } = buildStreamService()
    streamTextFn.mockReturnValueOnce(
      fakeStreamResult({
        toolCalls: [
          {
            toolCallId: 'call-1',
            toolName: 'lookup_voter',
            input: { voterId: 42 },
          },
        ],
      }),
    )

    const result = await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['m1'],
      retries: 0,
    })

    expect(await result.toolCalls).toEqual([
      {
        id: 'call-1',
        type: 'function',
        function: {
          name: 'lookup_voter',
          arguments: JSON.stringify({ voterId: 42 }),
        },
      },
    ])
  })

  it('passes tools through with Vercel tool() shape when provided', async () => {
    const { service, streamTextFn } = buildStreamService()
    streamTextFn.mockReturnValueOnce(fakeStreamResult())
    const lookupVoter = vi.fn().mockResolvedValue({ name: 'Jane' })

    await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['m1'],
      retries: 0,
      tools: {
        lookup_voter: {
          description: 'Look up a voter by id',
          inputSchema: z.object({ voterId: z.number() }),
          execute: lookupVoter,
        },
      },
      maxSteps: 2,
    })

    const call = streamTextFn.mock.calls[0][0]
    expect(call.tools).toHaveProperty('lookup_voter')
    expect(call.tools.lookup_voter.description).toBe('Look up a voter by id')
    expect(typeof call.tools.lookup_voter.execute).toBe('function')
    expect(call.stopWhen).toBeDefined()
  })

  it('falls back to next model when streamText throws at connect-time', async () => {
    const { service, streamTextFn } = buildStreamService()
    const transient = Object.assign(new Error('connect failed'), {
      status: 500,
    })
    streamTextFn
      .mockImplementationOnce(() => {
        throw transient
      })
      .mockReturnValueOnce(
        fakeStreamResult({ chunks: ['recovered'], finalText: 'recovered' }),
      )

    const result = await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['m1', 'm2'],
      retries: 0,
    })

    expect(result.model).toBe('m2')
    expect(await result.finalText).toBe('recovered')
    expect(streamTextFn).toHaveBeenCalledTimes(2)
  })

  it('does not fall back on permanent 4xx connect errors', async () => {
    const { service, streamTextFn } = buildStreamService()
    const perm = Object.assign(new Error('unauthorized'), { status: 401 })
    streamTextFn.mockImplementationOnce(() => {
      throw perm
    })

    await expect(
      service.streamChatCompletion({
        messages: [USER_MSG],
        models: ['m1', 'm2'],
        retries: 0,
      }),
    ).rejects.toThrow('unauthorized')

    expect(streamTextFn).toHaveBeenCalledTimes(1)
  })

  it('uses default models when none provided', async () => {
    const { service, streamTextFn } = buildStreamService()
    streamTextFn.mockReturnValueOnce(fakeStreamResult())

    const result = await service.streamChatCompletion({
      messages: [USER_MSG],
      retries: 0,
    })

    expect(result.model).toBe('model1')
  })

  it('routes claude-* model names to the anthropic provider', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'

    const togetherChatModel = vi.fn((model: string) => ({
      provider: 'together',
      modelId: model,
    }))
    const togetherProviderFactory: AiSdkProviderFactory = () =>
      ({
        chatModel: togetherChatModel,
      }) as unknown as OpenAICompatibleProvider

    const anthropicResolve = vi.fn((model: string) => ({
      provider: 'anthropic',
      modelId: model,
    }))
    const anthropicProviderFactory: AnthropicProviderFactory = vi.fn(
      () => anthropicResolve as never,
    )

    const streamTextFn = vi.fn().mockReturnValue(fakeStreamResult())
    const service = new LlmService(
      createMockLogger(),
      streamTextFn as unknown as StreamTextFn,
      stubClientFactory,
      togetherProviderFactory,
      anthropicProviderFactory,
    )

    await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['claude-sonnet-4-6'],
      retries: 0,
    })

    expect(anthropicProviderFactory).toHaveBeenCalledWith({
      apiKey: 'test-anthropic-key',
    })
    expect(anthropicResolve).toHaveBeenCalledWith('claude-sonnet-4-6')
    expect(togetherChatModel).not.toHaveBeenCalled()
    expect(streamTextFn.mock.calls[0][0].model).toEqual({
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    })
  })

  it('routes non-claude model names through the openai-compatible provider', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'

    const togetherChatModel = vi.fn((model: string) => ({
      provider: 'together',
      modelId: model,
    }))
    const togetherProviderFactory: AiSdkProviderFactory = () =>
      ({
        chatModel: togetherChatModel,
      }) as unknown as OpenAICompatibleProvider

    const anthropicResolve = vi.fn()
    const anthropicProviderFactory: AnthropicProviderFactory = () =>
      anthropicResolve as never

    const streamTextFn = vi.fn().mockReturnValue(fakeStreamResult())
    const service = new LlmService(
      createMockLogger(),
      streamTextFn as unknown as StreamTextFn,
      stubClientFactory,
      togetherProviderFactory,
      anthropicProviderFactory,
    )

    await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['deepseek-ai/DeepSeek-V4-Pro'],
      retries: 0,
    })

    expect(togetherChatModel).toHaveBeenCalledWith(
      'deepseek-ai/DeepSeek-V4-Pro',
    )
    expect(anthropicResolve).not.toHaveBeenCalled()
  })

  it('throws when a claude-* model is requested without ANTHROPIC_API_KEY set', async () => {
    delete process.env.ANTHROPIC_API_KEY

    const { service } = buildStreamService()

    await expect(
      service.streamChatCompletion({
        messages: [USER_MSG],
        models: ['claude-sonnet-4-6'],
        retries: 0,
      }),
    ).rejects.toThrow(/ANTHROPIC_API_KEY/)
  })
})

describe('LlmService.buildToolSet (via streamChatCompletion)', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.TOGETHER_AI_KEY = 'test-api-key'
    process.env.AI_MODELS = 'm1'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('fires onToolCallStart before execute and onToolCallEnd after with output', async () => {
    const streamTextFn = vi.fn().mockReturnValue(fakeStreamResult())
    const logger = createMockLogger()
    const service = new LlmService(
      logger,
      streamTextFn as unknown as StreamTextFn,
      stubClientFactory,
      noopProviderFactory,
    )

    const events: Array<{
      phase: 'start' | 'end'
      name: string
      input: unknown
      output?: unknown
    }> = []

    await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['m1'],
      retries: 0,
      tools: {
        lookup_voter: {
          description: 'Look up voter',
          inputSchema: z.object({ voterId: z.number() }),
          execute: async (input: unknown) => {
            const { voterId } = input as { voterId: number }
            return Promise.resolve({ id: voterId, name: 'Jane' })
          },
        },
      },
      onToolCallStart: ({ name, input }) => {
        events.push({ phase: 'start', name, input })
      },
      onToolCallEnd: ({ name, input, output }) => {
        events.push({ phase: 'end', name, input, output })
      },
    })

    const passedTools = streamTextFn.mock.calls[0][0].tools as Record<
      string,
      { execute: (input: unknown) => Promise<unknown> }
    >
    await passedTools.lookup_voter.execute({ voterId: 7 })

    expect(events).toEqual([
      { phase: 'start', name: 'lookup_voter', input: { voterId: 7 } },
      {
        phase: 'end',
        name: 'lookup_voter',
        input: { voterId: 7 },
        output: { id: 7, name: 'Jane' },
      },
    ])
  })

  it('logs tool execution success with tool name and input preview', async () => {
    const streamTextFn = vi.fn().mockReturnValue(fakeStreamResult())
    const logger = createMockLogger()
    const service = new LlmService(
      logger,
      streamTextFn as unknown as StreamTextFn,
      stubClientFactory,
      noopProviderFactory,
    )

    await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['m1'],
      retries: 0,
      tools: {
        lookup_voter: {
          description: 'Look up voter',
          inputSchema: z.object({ voterId: z.number() }),
          execute: async (input: unknown) => {
            const { voterId } = input as { voterId: number }
            return Promise.resolve({ id: voterId, name: 'Jane' })
          },
        },
      },
    })

    const passedTools = streamTextFn.mock.calls[0][0].tools as Record<
      string,
      { execute: (input: unknown) => Promise<unknown> }
    >
    const wrapped = passedTools.lookup_voter.execute

    await wrapped({ voterId: 42 })

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: 'lookup_voter',
        inputPreview: JSON.stringify({ voterId: 42 }),
      }),
      'LLM tool executed',
    )
  })

  it('wraps tool execute() so failures are logged with tool name and input preview', async () => {
    const streamTextFn = vi.fn().mockReturnValue(fakeStreamResult())
    const logger = createMockLogger()
    const service = new LlmService(
      logger,
      streamTextFn as unknown as StreamTextFn,
      stubClientFactory,
      noopProviderFactory,
    )

    const upstream = new Error('upstream broke')
    await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['m1'],
      retries: 0,
      tools: {
        broken_tool: {
          description: 'Always fails',
          inputSchema: z.object({ id: z.number() }),
          execute: () => {
            throw upstream
          },
        },
      },
    })

    const passedTools = streamTextFn.mock.calls[0][0].tools as Record<
      string,
      { execute: (input: unknown) => Promise<unknown> }
    >
    const wrapped = passedTools.broken_tool.execute

    await expect(wrapped({ id: 7 })).rejects.toBe(upstream)

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        err: upstream,
        toolName: 'broken_tool',
        inputPreview: JSON.stringify({ id: 7 }),
      }),
      'LLM tool execution failed',
    )
  })

  it('produces a safe inputPreview when input contains BigInt', async () => {
    const streamTextFn = vi.fn().mockReturnValue(fakeStreamResult())
    const logger = createMockLogger()
    const service = new LlmService(
      logger,
      streamTextFn as unknown as StreamTextFn,
      stubClientFactory,
      noopProviderFactory,
    )

    const upstream = new Error('boom')
    await service.streamChatCompletion({
      messages: [USER_MSG],
      models: ['m1'],
      retries: 0,
      tools: {
        bigint_tool: {
          description: 'BigInt input',
          inputSchema: z.unknown(),
          execute: () => {
            throw upstream
          },
        },
      },
    })

    const passedTools = streamTextFn.mock.calls[0][0].tools as Record<
      string,
      { execute: (input: unknown) => Promise<unknown> }
    >

    await expect(passedTools.bigint_tool.execute({ big: 5n })).rejects.toBe(
      upstream,
    )

    const call = (logger.error as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as {
      inputPreview: string
    }
    expect(typeof call.inputPreview).toBe('string')
    expect(call.inputPreview.length).toBeGreaterThan(0)
  })
})

describe('toModelMessages conversion', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.TOGETHER_AI_KEY = 'test-api-key'
    process.env.AI_MODELS = 'm1'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  it('passes a plain user string through to streamText as a ModelMessage', async () => {
    const { service, streamTextFn } = buildStreamService()
    streamTextFn.mockReturnValueOnce(fakeStreamResult())

    await service.streamChatCompletion({
      messages: [{ role: 'user', content: 'hello' }],
      models: ['m1'],
      retries: 0,
    })

    expect(streamTextFn.mock.calls[0][0].messages).toEqual([
      { role: 'user', content: 'hello' },
    ])
  })

  it('converts user array text parts to AI SDK text parts', async () => {
    const { service, streamTextFn } = buildStreamService()
    streamTextFn.mockReturnValueOnce(fakeStreamResult())

    await service.streamChatCompletion({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            { type: 'text', text: ' world' },
          ],
        },
      ],
      models: ['m1'],
      retries: 0,
    })

    expect(streamTextFn.mock.calls[0][0].messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'text', text: ' world' },
        ],
      },
    ])
  })

  it('throws when the messages list contains an unsupported role', async () => {
    const { service } = buildStreamService()

    await expect(
      service.streamChatCompletion({
        messages: [
          {
            role: 'function',
            name: 'old_fn',
            content: 'legacy',
          },
        ],
        models: ['m1'],
        retries: 0,
      }),
    ).rejects.toThrow(
      'Unsupported message role for AI SDK conversion: function',
    )
  })
})
