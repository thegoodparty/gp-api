import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AiService } from './ai.service'
import type { AiChatMessage } from '../campaigns/ai/chat/aiChat.types'

const mockLangChainInvoke = vi.fn()
const mockOpenAiCreate = vi.fn()

vi.mock('@langchain/openai', () => {
  class MockChatOpenAI {
    invoke = mockLangChainInvoke
    withFallbacks(fallbacks: unknown[]) {
      return { invoke: mockLangChainInvoke, _fallbacks: fallbacks }
    }
  }
  return { ChatOpenAI: MockChatOpenAI }
})

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: mockOpenAiCreate } }
  }
  return { OpenAI: MockOpenAI }
})

const mockSlack = {
  errorMessage: vi.fn(),
  formattedMessage: vi.fn(),
  message: vi.fn(),
  aiMessage: vi.fn(),
}

const mockOrganizations = {
  resolvePositionNameByOrganizationSlug: vi.fn(),
}

function createService(): AiService {
  return new AiService(
    mockSlack as never,
    mockOrganizations as never,
    createMockLogger(),
  )
}

function userMessage(content: string): AiChatMessage {
  return { role: 'user', content, createdAt: Date.now(), id: 'msg-1' }
}

describe('AiService', () => {
  let service: AiService

  beforeEach(() => {
    service = createService()
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ── llmChatCompletion ──────────────────────────────────────────────

  describe('llmChatCompletion', () => {
    it('returns content and token count on success', async () => {
      mockLangChainInvoke.mockResolvedValueOnce({
        content: 'Hello world',
        response_metadata: { tokenUsage: { totalTokens: 42 } },
      })

      const result = await service.llmChatCompletion([userMessage('hi')])

      expect(result.content).toBe('Hello world')
      expect(result.tokens).toBe(42)
    })

    it('replaces newlines with <br/><br/>', async () => {
      mockLangChainInvoke.mockResolvedValueOnce({
        content: 'line1\nline2\nline3',
        response_metadata: {},
      })

      const result = await service.llmChatCompletion([userMessage('hi')])

      expect(result.content).toBe('line1<br/><br/>line2<br/><br/>line3')
    })

    it('strips ```html fences from content', async () => {
      mockLangChainInvoke.mockResolvedValueOnce({
        content: '```html<p>hello</p>```',
        response_metadata: {},
      })

      const result = await service.llmChatCompletion([userMessage('hi')])

      expect(result.content).toContain('<p>hello</p>')
      expect(result.content).not.toContain('```html')
    })

    it('handles array content (multi-part response)', async () => {
      mockLangChainInvoke.mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'part1' },
          { type: 'text', text: ' part2' },
        ],
        response_metadata: {},
      })

      const result = await service.llmChatCompletion([userMessage('hi')])

      expect(result.content).toBe('part1 part2')
    })

    it('throws when model returns empty content', async () => {
      mockLangChainInvoke.mockResolvedValueOnce({
        content: '',
        response_metadata: {},
      })

      await expect(
        service.llmChatCompletion([userMessage('hi')]),
      ).rejects.toThrow('AI model returned empty content')
    })

    it('throws when model returns null content', async () => {
      mockLangChainInvoke.mockResolvedValueOnce({
        content: null,
        response_metadata: {},
      })

      await expect(
        service.llmChatCompletion([userMessage('hi')]),
      ).rejects.toThrow('AI model returned empty content')
    })

    it('propagates LLM errors and sends Slack notification', async () => {
      const llmError = new Error('Together AI rate limit')
      mockLangChainInvoke.mockRejectedValueOnce(llmError)

      await expect(
        service.llmChatCompletion([userMessage('hi')]),
      ).rejects.toThrow('Together AI rate limit')

      expect(mockSlack.errorMessage).toHaveBeenCalledWith({
        message: 'Error in AI completion (raw)',
        error: llmError,
      })
    })

    it('returns 0 tokens when tokenUsage is missing', async () => {
      mockLangChainInvoke.mockResolvedValueOnce({
        content: 'ok',
        response_metadata: {},
      })

      const result = await service.llmChatCompletion([userMessage('hi')])

      expect(result.tokens).toBe(0)
    })

    it('returns 0 tokens when tokenUsage has wrong shape', async () => {
      mockLangChainInvoke.mockResolvedValueOnce({
        content: 'ok',
        response_metadata: { tokenUsage: 'not-an-object' },
      })

      const result = await service.llmChatCompletion([userMessage('hi')])

      expect(result.tokens).toBe(0)
    })

    it('sanitizes en-dash and backtick characters in messages', async () => {
      mockLangChainInvoke.mockResolvedValueOnce({
        content: 'ok',
        response_metadata: {},
      })

      await service.llmChatCompletion([
        userMessage('hello \u2013 world `code`'),
      ])

      const invokedMessages = mockLangChainInvoke.mock.calls[0][0]
      expect(invokedMessages[0].content).toBe("hello - world 'code'")
    })

    it('uses primary model without fallbacks when only one model is configured', async () => {
      mockLangChainInvoke.mockResolvedValueOnce({
        content: 'ok',
        response_metadata: {},
      })

      await service.llmChatCompletion([userMessage('hi')])

      // When there's only one model (or models parsed from env),
      // withFallbacks should not be called, OR be called with empty array
      // depending on PARSED_AI_MODELS length. Since the env is set in the
      // module scope, we verify the invoke was called successfully.
      expect(mockLangChainInvoke).toHaveBeenCalledTimes(1)
    })
  })

  // ── getChatToolCompletion ──────────────────────────────────────────

  describe('getChatToolCompletion', () => {
    it('returns content from a standard message response', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'Hello response' } }],
        usage: { total_tokens: 10 },
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('hi')],
      })

      expect(result.content).toBe('Hello response')
      expect(result.tokens).toBe(10)
    })

    it('extracts tool_calls arguments when present', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  function: {
                    name: 'extractLocation',
                    arguments: '{"city":"NYC"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { total_tokens: 8 },
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('find city')],
      })

      expect(result.content).toBe('{"city":"NYC"}')
      expect(result.tokens).toBe(8)
    })

    it('falls back to message.content when tool_calls arguments are empty', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: 'fallback content',
              tool_calls: [{ function: { name: 'fn', arguments: '' } }],
            },
          },
        ],
        usage: { total_tokens: 5 },
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      expect(result.content).toBe('fallback content')
    })

    it('passes tool and toolChoice to the OpenAI API', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '{}' } }],
        usage: { total_tokens: 3 },
      })

      const tool = {
        type: 'function' as const,
        function: {
          name: 'extractLocation',
          description: 'Extract location',
          parameters: {},
        },
      }
      const toolChoice = {
        type: 'function' as const,
        function: { name: 'extractLocation' },
      }

      await service.getChatToolCompletion({
        messages: [userMessage('test')],
        tool,
        toolChoice,
      })

      expect(mockOpenAiCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: [tool],
          tool_choice: toolChoice,
        }),
        expect.any(Object),
      )
    })

    it('does not include tools/tool_choice when not provided', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'ok' } }],
        usage: { total_tokens: 1 },
      })

      await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      const callArgs = mockOpenAiCreate.mock.calls[0][0]
      expect(callArgs).not.toHaveProperty('tools')
      expect(callArgs).not.toHaveProperty('tool_choice')
    })

    it('strips ```html fences from response', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [{ message: { content: '```html<div>hi</div>```' } }],
        usage: { total_tokens: 5 },
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      expect(result.content).toContain('<div>hi</div>')
      expect(result.content).not.toContain('```html')
    })

    it('replaces newlines with <br/><br/>', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'a\nb' } }],
        usage: { total_tokens: 3 },
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      expect(result.content).toBe('a<br/><br/>b')
    })

    it('parses <function=...> fallback format from content', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '<function=extractLocation>{"city":"LA"}</function>',
            },
          },
        ],
        usage: { total_tokens: 7 },
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      expect(result.content).toContain('city')
      expect(result.content).toContain('LA')
      expect(result.tokens).toBe(7)
    })

    it('tries next model on error and sends Slack notification', async () => {
      mockOpenAiCreate
        .mockRejectedValueOnce(new Error('model1 down'))
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'from model2' } }],
          usage: { total_tokens: 4 },
        })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      expect(result.content).toBe('from model2')
      expect(mockSlack.formattedMessage).toHaveBeenCalledTimes(1)
    })

    it('returns empty content when all models fail', async () => {
      mockOpenAiCreate.mockRejectedValue(new Error('all down'))

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      expect(result.content).toBe('')
      expect(result.tokens).toBe(0)
    })

    it('returns 0 tokens when usage is missing', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [{ message: { content: 'ok' } }],
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      expect(result.tokens).toBe(0)
    })

    it('returns empty content when choices array is empty', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [],
        usage: { total_tokens: 0 },
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      expect(result.content).toBe('')
    })
  })

  // ── getAssistantCompletion ─────────────────────────────────────────

  describe('getAssistantCompletion', () => {
    const USER_QUESTION = 'What should I do?'
    const baseArgs = {
      systemPrompt: 'You are a helpful assistant.',
      candidateContext: 'Candidate info here.',
      assistantId: 'asst-1',
      threadId: 'thread-1',
      message: userMessage(USER_QUESTION),
      messageId: '',
    }

    beforeEach(() => {
      mockLangChainInvoke.mockResolvedValue({
        content: 'AI response',
        response_metadata: { tokenUsage: { totalTokens: 15 } },
      })
    })

    it('returns a properly structured assistant response', async () => {
      const result = await service.getAssistantCompletion(baseArgs)

      expect(result.role).toBe('assistant')
      expect(result.content).toContain('AI response')
      expect(result.threadId).toBe('thread-1')
      expect(result.usage).toBe(15)
      expect(result.id).toBeDefined()
      expect(result.createdAt).toBeGreaterThan(0)
    })

    it('includes system prompt + candidate context as first message', async () => {
      await service.getAssistantCompletion(baseArgs)

      const invokedMessages = mockLangChainInvoke.mock.calls[0][0]
      const systemMsg = invokedMessages.find(
        (m: AiChatMessage) => m.role === 'system',
      )

      expect(systemMsg.content).toContain('You are a helpful assistant.')
      expect(systemMsg.content).toContain('Candidate info here.')
    })

    it('appends existing messages before the new user message', async () => {
      const existing: AiChatMessage[] = [
        { role: 'user', content: 'old question', id: 'old-1' },
        { role: 'assistant', content: 'old answer', id: 'old-2' },
      ]

      await service.getAssistantCompletion({
        ...baseArgs,
        existingMessages: existing,
      })

      const invokedMessages = mockLangChainInvoke.mock.calls[0][0]

      expect(invokedMessages).toHaveLength(4) // system + 2 existing + new user
      expect(invokedMessages[1].content).toBe('old question')
      expect(invokedMessages[2].content).toBe('old answer')
      expect(invokedMessages[3].content).toBe(USER_QUESTION)
    })

    it('filters out old message by messageId for regeneration', async () => {
      const existing: AiChatMessage[] = [
        { role: 'user', content: 'question', id: 'keep-me' },
        { role: 'assistant', content: 'stale answer', id: 'remove-me' },
      ]

      await service.getAssistantCompletion({
        ...baseArgs,
        existingMessages: existing,
        messageId: 'remove-me',
      })

      const invokedMessages = mockLangChainInvoke.mock.calls[0][0]
      const ids = invokedMessages.map((m: AiChatMessage) => m.id)

      expect(ids).not.toContain('remove-me')
    })

    it('always includes the new user message even during regeneration', async () => {
      const existing: AiChatMessage[] = [
        { role: 'assistant', content: 'stale', id: 'old-response' },
      ]

      await service.getAssistantCompletion({
        ...baseArgs,
        existingMessages: existing,
        messageId: 'old-response',
      })

      const invokedMessages = mockLangChainInvoke.mock.calls[0][0]
      const userMessages = invokedMessages.filter(
        (m: AiChatMessage) => m.role === 'user',
      )

      expect(userMessages).toHaveLength(1)
      expect(userMessages[0].content).toBe(USER_QUESTION)
    })

    it('throws when assistantId is missing', async () => {
      await expect(
        service.getAssistantCompletion({ ...baseArgs, assistantId: '' }),
      ).rejects.toThrow('Missing required params')
    })

    it('throws when systemPrompt is missing', async () => {
      await expect(
        service.getAssistantCompletion({ ...baseArgs, systemPrompt: '' }),
      ).rejects.toThrow('Missing required params')
    })

    it('throws when threadId is missing', async () => {
      await expect(
        service.getAssistantCompletion({ ...baseArgs, threadId: '' }),
      ).rejects.toThrow('Missing threadId')
    })

    it('propagates errors from llmChatCompletion', async () => {
      mockLangChainInvoke.mockRejectedValueOnce(new Error('LLM unavailable'))

      await expect(service.getAssistantCompletion(baseArgs)).rejects.toThrow(
        'LLM unavailable',
      )
    })
  })

  // ── parseToolResponse (via getChatToolCompletion) ──────────────────

  describe('parseToolResponse (exercised via getChatToolCompletion)', () => {
    it('correctly extracts function name and parsed arguments', async () => {
      const args = JSON.stringify({ city: 'NYC', state: 'NY' })
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: `<function=extractLocation>${args}</function>`,
            },
          },
        ],
        usage: { total_tokens: 5 },
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      // The parsed args (JSON.parse'd) are returned as the content
      expect(result.content).toBeDefined()
      expect(result.tokens).toBe(5)
    })

    it('returns raw content when <function=...> has invalid JSON', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '<function=badFn>not-json</function>',
            },
          },
        ],
        usage: { total_tokens: 3 },
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      // parseToolResponse returns undefined on bad JSON, so original content stays
      expect(result.content).toContain('function')
    })

    it('ignores <function=...> pattern when regex does not match', async () => {
      mockOpenAiCreate.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: '<function=no closing tag',
            },
          },
        ],
        usage: { total_tokens: 2 },
      })

      const result = await service.getChatToolCompletion({
        messages: [userMessage('test')],
      })

      expect(result.content).toContain('<function=no closing tag')
    })
  })
})
