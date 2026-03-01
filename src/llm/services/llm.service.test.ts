import { createMockLogger } from 'src/shared/test-utils/mockLogger.util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { LlmService } from './llm.service'

const mockCreate = vi.fn()

vi.mock('openai', () => {
  class MockOpenAI {
    chat = {
      completions: {
        create: mockCreate,
      },
    }
    baseURL = 'https://api.together.xyz/v1'
  }

  return {
    OpenAI: MockOpenAI,
  }
})

describe('LlmService', () => {
  let originalEnv: NodeJS.ProcessEnv

  const createServiceWithMockLogger = (): LlmService => {
    const service = new LlmService(createMockLogger())
    return service
  }

  beforeEach(() => {
    originalEnv = { ...process.env }
    process.env.TOGETHER_AI_KEY = 'test-api-key'
    process.env.AI_MODELS = 'model1,model2,model3'
    mockCreate.mockClear()
    vi.useRealTimers()
  })

  afterEach(() => {
    process.env = originalEnv
    vi.useRealTimers()
  })

  describe('chatCompletion - model fallback behavior', () => {
    let service: LlmService

    beforeEach(() => {
      service = createServiceWithMockLogger()
    })

    it('tries all models in sequence when each fails', async () => {
      const mockCompletion = {
        choices: [{ message: { content: 'Success' } }],
        usage: { total_tokens: 5 },
      }

      mockCreate
        .mockRejectedValueOnce(new Error('Model 1 failed'))
        .mockRejectedValueOnce(new Error('Model 2 failed'))
        .mockResolvedValueOnce(mockCompletion)

      const result = await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        models: ['model1', 'model2', 'model3'],
        retries: 0,
      })

      expect(result.model).toBe('model3')
      expect(result.content).toBe('Success')
      expect(mockCreate).toHaveBeenCalledTimes(3)
    })

    it('returns first successful model without trying remaining models', async () => {
      const mockCompletion = {
        choices: [{ message: { content: 'Success' } }],
        usage: { total_tokens: 5 },
      }

      mockCreate.mockResolvedValueOnce(mockCompletion)

      const result = await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        models: ['model1', 'model2', 'model3'],
        retries: 0,
      })

      expect(result.model).toBe('model1')
      expect(mockCreate).toHaveBeenCalledTimes(1)
    })

    it('uses default models when none provided', async () => {
      const mockCompletion = {
        choices: [{ message: { content: 'Success' } }],
        usage: { total_tokens: 5 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: 'model1' }),
        expect.any(Object),
      )
    })
  })

  describe('chatCompletion - retry behavior', () => {
    let service: LlmService

    beforeEach(() => {
      service = createServiceWithMockLogger()
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('retries transient errors before trying next model', async () => {
      const mockCompletion = {
        choices: [{ message: { content: 'Success' } }],
        usage: { total_tokens: 5 },
      }

      const transientError = new Error('Network timeout')
      ;(transientError as { status?: number }).status = 500

      mockCreate
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce(mockCompletion)

      const promise = service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        models: ['model1'],
        retries: 2,
      })

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result.content).toBe('Success')
      expect(mockCreate).toHaveBeenCalledTimes(3)
    })

    it('does not retry permanent client errors (4xx)', async () => {
      const clientError = new Error('Bad Request')
      ;(clientError as { status?: number }).status = 400

      mockCreate.mockRejectedValueOnce(clientError)

      await expect(
        service.chatCompletion({
          messages: [{ role: 'user', content: 'Test' }],
          models: ['model1'],
          retries: 3,
        }),
      ).rejects.toThrow('Bad Request')

      expect(mockCreate).toHaveBeenCalledTimes(1)
    })

    it('combines retries with model fallback correctly', async () => {
      const mockCompletion = {
        choices: [{ message: { content: 'Success' } }],
        usage: { total_tokens: 5 },
      }

      const transientError = new Error('Transient error')
      ;(transientError as { status?: number }).status = 500

      mockCreate
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(transientError)
        .mockRejectedValueOnce(new Error('Model 1 exhausted'))
        .mockResolvedValueOnce(mockCompletion)

      const promise = service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        models: ['model1', 'model2'],
        retries: 2,
      })

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result.model).toBe('model2')
      expect(result.content).toBe('Success')
      expect(mockCreate).toHaveBeenCalledTimes(4)
    })
  })

  describe('chatCompletion - content extraction', () => {
    let service: LlmService

    beforeEach(() => {
      service = createServiceWithMockLogger()
    })

    it('handles string content', async () => {
      const mockCompletion = {
        choices: [{ message: { content: 'Hello, world!' } }],
        usage: { total_tokens: 10 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      })

      expect(result.content).toBe('Hello, world!')
    })

    it('handles array content format', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: [
                { type: 'text', text: 'Hello' },
                { type: 'text', text: ' World' },
              ],
            },
          },
        ],
        usage: { total_tokens: 5 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      })

      expect(result.content).toBe('Hello World')
    })

    it('handles null content gracefully', async () => {
      const mockCompletion = {
        choices: [{ message: { content: null } }],
        usage: { total_tokens: 0 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      })

      expect(result.content).toBe('')
    })

    it('trims whitespace from content', async () => {
      const mockCompletion = {
        choices: [{ message: { content: '  Hello World  ' } }],
        usage: { total_tokens: 5 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      })

      expect(result.content).toBe('Hello World')
    })

    it('extracts tool calls from response', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: 'Tool call response',
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'test_function',
                    arguments: '{"arg": "value"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { total_tokens: 10 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      })

      expect(result.toolCalls).toEqual([
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'test_function',
            arguments: '{"arg": "value"}',
          },
        },
      ])
    })

    it('handles missing choices array', async () => {
      const mockCompletion = {
        choices: [],
        usage: { total_tokens: 0 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      })

      expect(result.content).toBe('')
    })

    it('handles missing usage information', async () => {
      const mockCompletion = {
        choices: [{ message: { content: 'Test' } }],
        usage: undefined,
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      })

      expect(result.tokens).toBe(0)
    })
  })

  describe('jsonCompletion - JSON parsing and validation', () => {
    let service: LlmService
    const testSchema = z.object({
      name: z.string(),
      age: z.number(),
    })

    beforeEach(() => {
      service = createServiceWithMockLogger()
    })

    it('parses and validates valid JSON', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: JSON.stringify({ name: 'John', age: 30 }),
            },
          },
        ],
        usage: { total_tokens: 10 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.jsonCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        schema: testSchema,
      })

      expect(result.object).toEqual({ name: 'John', age: 30 })
      expect(result.tokens).toBe(10)
    })

    it('removes markdown code blocks from JSON', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: '```json\n{"name": "John", "age": 30}\n```',
            },
          },
        ],
        usage: { total_tokens: 10 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.jsonCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        schema: testSchema,
      })

      expect(result.object).toEqual({ name: 'John', age: 30 })
    })

    it('removes trailing commas from JSON', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: '{"name": "John", "age": 30,}',
            },
          },
        ],
        usage: { total_tokens: 10 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.jsonCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        schema: testSchema,
      })

      expect(result.object).toEqual({ name: 'John', age: 30 })
    })

    it('handles JSON with multiple trailing commas', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: '{"name": "John", "age": 30, "city": "NYC",}',
            },
          },
        ],
        usage: { total_tokens: 10 },
      }

      const schema = z.object({
        name: z.string(),
        age: z.number(),
        city: z.string(),
      })

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.jsonCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        schema,
      })

      expect(result.object).toEqual({ name: 'John', age: 30, city: 'NYC' })
    })

    it('throws error on invalid JSON that cannot be cleaned', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: 'not valid json at all',
            },
          },
        ],
        usage: { total_tokens: 10 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      await expect(
        service.jsonCompletion({
          messages: [{ role: 'user', content: 'Test' }],
          schema: testSchema,
          models: ['model1'],
          retries: 0,
        }),
      ).rejects.toThrow('Model returned invalid JSON for model1')
    })

    it('throws error on schema validation failure', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: JSON.stringify({ name: 'John' }),
            },
          },
        ],
        usage: { total_tokens: 10 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      await expect(
        service.jsonCompletion({
          messages: [{ role: 'user', content: 'Test' }],
          schema: testSchema,
          models: ['model1'],
          retries: 0,
        }),
      ).rejects.toThrow()
    })

    it('uses zero temperature by default for JSON completion', async () => {
      const mockCompletion = {
        choices: [{ message: { content: '{}' } }],
        usage: { total_tokens: 5 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      await service.jsonCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        schema: z.object({}),
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
        expect.any(Object),
      )
    })

    it('retries on JSON parsing errors across models', async () => {
      vi.useFakeTimers()

      const validCompletion = {
        choices: [
          {
            message: {
              content: JSON.stringify({ name: 'John', age: 30 }),
            },
          },
        ],
        usage: { total_tokens: 10 },
      }

      mockCreate
        .mockResolvedValueOnce({
          choices: [{ message: { content: 'invalid json' } }],
          usage: { total_tokens: 10 },
        })
        .mockResolvedValueOnce(validCompletion)

      const promise = service.jsonCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        schema: testSchema,
        models: ['model1', 'model2'],
        retries: 1,
      })

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result.object).toEqual({ name: 'John', age: 30 })
      expect(result.model).toBe('model2')

      vi.useRealTimers()
    })
  })

  describe('toolCompletion', () => {
    let service: LlmService

    beforeEach(() => {
      service = createServiceWithMockLogger()
    })

    it('returns completion with tool calls', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: 'Tool response',
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'test_tool',
                    arguments: '{"param": "value"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { total_tokens: 15 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.toolCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_tool',
              description: 'Test tool',
            },
          },
        ],
      })

      expect(result.toolCalls).toEqual([
        {
          id: 'call-1',
          type: 'function',
          function: {
            name: 'test_tool',
            arguments: '{"param": "value"}',
          },
        },
      ])
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.any(Array),
          temperature: 0.1,
          top_p: 0.1,
        }),
        expect.any(Object),
      )
    })

    it('throws error when tools array is empty', async () => {
      await expect(
        service.toolCompletion({
          messages: [{ role: 'user', content: 'Test' }],
          tools: [],
        }),
      ).rejects.toThrow('Tools must be provided for tool completion')
    })

    it('handles completion without tool calls', async () => {
      const mockCompletion = {
        choices: [
          {
            message: {
              content: 'Regular response',
            },
          },
        ],
        usage: { total_tokens: 5 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      const result = await service.toolCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_tool',
              description: 'Test',
            },
          },
        ],
      })

      expect(result.toolCalls).toBeUndefined()
      expect(result.content).toBe('Regular response')
    })

    it('includes toolChoice when provided', async () => {
      const mockCompletion = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 5 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      await service.toolCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        tools: [
          {
            type: 'function',
            function: {
              name: 'test_tool',
              description: 'Test',
            },
          },
        ],
        toolChoice: { type: 'function', function: { name: 'test_tool' } },
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          tool_choice: { type: 'function', function: { name: 'test_tool' } },
        }),
        expect.any(Object),
      )
    })
  })

  describe('error handling - permanent vs transient errors', () => {
    let service: LlmService

    beforeEach(() => {
      service = createServiceWithMockLogger()
    })

    it('identifies 4xx errors as permanent and does not retry', async () => {
      const error400 = new Error('Bad Request')
      ;(error400 as { status?: number }).status = 400

      mockCreate.mockRejectedValue(error400)

      await expect(
        service.chatCompletion({
          messages: [{ role: 'user', content: 'Test' }],
          models: ['model1'],
          retries: 0,
        }),
      ).rejects.toThrow('Bad Request')

      expect(mockCreate).toHaveBeenCalledTimes(1)
    })

    it('retries 5xx errors as transient', async () => {
      vi.useFakeTimers()

      const error500 = new Error('Internal Server Error')
      ;(error500 as { status?: number }).status = 500

      const mockCompletion = {
        choices: [{ message: { content: 'Success' } }],
        usage: { total_tokens: 5 },
      }

      mockCreate
        .mockRejectedValueOnce(error500)
        .mockResolvedValueOnce(mockCompletion)

      const promise = service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        models: ['model1'],
        retries: 1,
      })

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result.content).toBe('Success')
      expect(mockCreate).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })

    it('handles errors without status codes as transient', async () => {
      vi.useFakeTimers()

      const networkError = new Error('Network error')

      const mockCompletion = {
        choices: [{ message: { content: 'Success' } }],
        usage: { total_tokens: 5 },
      }

      mockCreate
        .mockRejectedValueOnce(networkError)
        .mockResolvedValueOnce(mockCompletion)

      const promise = service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        models: ['model1'],
        retries: 1,
      })

      await vi.runAllTimersAsync()
      const result = await promise

      expect(result.content).toBe('Success')
      expect(mockCreate).toHaveBeenCalledTimes(2)

      vi.useRealTimers()
    })
  })

  describe('user identification for token caching', () => {
    let service: LlmService

    beforeEach(() => {
      service = createServiceWithMockLogger()
    })

    it('includes userId in request when provided', async () => {
      const mockCompletion = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 5 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
        userId: 'user-123',
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          user: 'user-123',
        }),
        expect.any(Object),
      )
    })

    it('omits userId when not provided', async () => {
      const mockCompletion = {
        choices: [{ message: { content: 'Test' } }],
        usage: { total_tokens: 5 },
      }

      mockCreate.mockResolvedValue(mockCompletion)

      await service.chatCompletion({
        messages: [{ role: 'user', content: 'Test' }],
      })

      expect(mockCreate).toHaveBeenCalledWith(
        expect.not.objectContaining({
          user: expect.anything(),
        }),
        expect.any(Object),
      )
    })
  })
})
