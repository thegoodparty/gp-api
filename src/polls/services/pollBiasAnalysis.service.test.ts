import { BadGatewayException, BadRequestException } from '@nestjs/common'
import { LlmService } from 'src/llm/services/llm.service'
import { BraintrustService } from 'src/vendors/braintrust/braintrust.service'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPollBiasAnalysisPrompt } from '../utils/pollBiasPrompt.util'
import { PollBiasAnalysisService } from './pollBiasAnalysis.service'

vi.mock('src/llm/services/llm.service')
vi.mock('src/vendors/braintrust/braintrust.service')
vi.mock('../utils/pollBiasPrompt.util', () => ({
  createPollBiasAnalysisPrompt: vi.fn(),
}))

describe('PollBiasAnalysisService', () => {
  let service: PollBiasAnalysisService
  let llmService: {
    jsonCompletion: ReturnType<typeof vi.fn>
  }
  let braintrustService: {
    enabled: boolean
    traced: ReturnType<typeof vi.fn>
    loadPromptMessages: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    llmService = {
      jsonCompletion: vi.fn(),
    }

    braintrustService = {
      enabled: false,
      traced: vi.fn((name, fn) => fn()),
      loadPromptMessages: vi.fn(),
    }

    vi.mocked(LlmService).mockImplementation(
      () => llmService as unknown as LlmService,
    )
    vi.mocked(BraintrustService).mockImplementation(
      () => braintrustService as unknown as BraintrustService,
    )

    service = new PollBiasAnalysisService(
      llmService as unknown as LlmService,
      braintrustService as unknown as BraintrustService,
    )

    vi.mocked(createPollBiasAnalysisPrompt).mockReturnValue([
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Analyze this text' },
    ])
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('analyzePollText', () => {
    it('returns bias analysis response with converted spans', async () => {
      const mockLlmResponse = {
        object: {
          bias_spans: [
            { substring: 'world', reason: 'bias', suggestion: 'planet' },
          ],
          grammar_spans: [{ substring: 'hello', reason: 'grammar' }],
          rewritten_text: 'Hello planet',
        },
        tokens: 100,
        model: 'model1',
      }

      llmService.jsonCompletion.mockResolvedValue(mockLlmResponse)

      const result = await service.analyzePollText('hello world')

      expect(result).toEqual({
        bias_spans: [
          {
            start: 6,
            end: 11,
            reason: 'bias',
            suggestion: 'planet',
          },
        ],
        grammar_spans: [
          {
            start: 0,
            end: 5,
            reason: 'grammar',
            suggestion: undefined,
          },
        ],
        rewritten_text: 'Hello planet',
      })
    })

    it('calls LLM service with correct parameters', async () => {
      const mockLlmResponse = {
        object: {
          bias_spans: [],
          grammar_spans: [],
          rewritten_text: 'Test text',
        },
        tokens: 50,
        model: 'model1',
      }

      llmService.jsonCompletion.mockResolvedValue(mockLlmResponse)

      await service.analyzePollText('test poll text', 'user-123')

      expect(llmService.jsonCompletion).toHaveBeenCalledWith({
        messages: expect.any(Array),
        schema: expect.any(Object),
        temperature: 0.2,
        maxTokens: 512,
        userId: 'user-123',
        models: [
          'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
          'Qwen/Qwen3-235B-A22B-fp8-tput',
        ],
      })
    })

    it('uses fallback prompt when Braintrust is disabled', async () => {
      braintrustService.enabled = false

      const mockLlmResponse = {
        object: {
          bias_spans: [],
          grammar_spans: [],
          rewritten_text: 'Test',
        },
        tokens: 10,
        model: 'model1',
      }

      llmService.jsonCompletion.mockResolvedValue(mockLlmResponse)

      await service.analyzePollText('test')

      expect(createPollBiasAnalysisPrompt).toHaveBeenCalledWith('test')
      expect(braintrustService.loadPromptMessages).not.toHaveBeenCalled()
    })

    it('uses Braintrust prompt when enabled', async () => {
      braintrustService.enabled = true
      braintrustService.loadPromptMessages.mockResolvedValue([
        { role: 'system', content: 'Braintrust prompt' },
        { role: 'user', content: 'Analyze: test' },
      ])

      const mockLlmResponse = {
        object: {
          bias_spans: [],
          grammar_spans: [],
          rewritten_text: 'Test',
        },
        tokens: 10,
        model: 'model1',
      }

      llmService.jsonCompletion.mockResolvedValue(mockLlmResponse)

      await service.analyzePollText('test')

      expect(braintrustService.loadPromptMessages).toHaveBeenCalledWith(
        'poll-bias-analysis',
        expect.any(Array),
        { pollText: 'test' },
      )
    })

    it('wraps LLM call with Braintrust tracing', async () => {
      braintrustService.enabled = true
      braintrustService.traced.mockImplementation(async (name, fn) => fn())
      braintrustService.loadPromptMessages.mockResolvedValue([
        { role: 'system', content: 'Braintrust prompt' },
        { role: 'user', content: 'Analyze: test' },
      ])

      const mockLlmResponse = {
        object: {
          bias_spans: [],
          grammar_spans: [],
          rewritten_text: 'Test',
        },
        tokens: 10,
        model: 'model1',
      }

      llmService.jsonCompletion.mockResolvedValue(mockLlmResponse)

      await service.analyzePollText('test', 'user-123')

      expect(braintrustService.traced).toHaveBeenCalledWith(
        'poll-bias-analysis',
        expect.any(Function),
        {
          input: { pollText: 'test', messages: expect.any(Array) },
          metadata: { userId: 'user-123' },
        },
      )
    })

    it('retries on validation errors', async () => {
      vi.useFakeTimers()

      const validationError = new Error('ZodError: validation failed')
      const successResponse = {
        object: {
          bias_spans: [],
          grammar_spans: [],
          rewritten_text: 'Success',
        },
        tokens: 10,
        model: 'model1',
      }

      braintrustService.traced.mockImplementation(async (name, fn) => {
        try {
          return await fn()
        } catch (error) {
          throw error
        }
      })

      llmService.jsonCompletion
        .mockRejectedValueOnce(validationError)
        .mockRejectedValueOnce(validationError)
        .mockResolvedValueOnce(successResponse)

      const resultPromise = service.analyzePollText('test')

      await vi.runAllTimersAsync()

      const result = await resultPromise

      expect(result.rewritten_text).toBe('Success')
      expect(llmService.jsonCompletion).toHaveBeenCalledTimes(3)

      vi.useRealTimers()
    })

    it('bails on non-validation errors', async () => {
      const networkError = new Error('Network error')

      llmService.jsonCompletion.mockRejectedValue(networkError)

      await expect(service.analyzePollText('test')).rejects.toThrow(
        BadGatewayException,
      )
    })

    it('handles bias spans that cannot be found in text', async () => {
      const mockLlmResponse = {
        object: {
          bias_spans: [{ substring: 'nonexistent', reason: 'bias' }],
          grammar_spans: [],
          rewritten_text: 'Test',
        },
        tokens: 10,
        model: 'model1',
      }

      llmService.jsonCompletion.mockResolvedValue(mockLlmResponse)

      const result = await service.analyzePollText('test text')

      expect(result.bias_spans).toEqual([])
      expect(result.rewritten_text).toBe('Test')
    })

    it('handles grammar spans that overlap with bias spans', async () => {
      const mockLlmResponse = {
        object: {
          bias_spans: [{ substring: 'world', reason: 'bias' }],
          grammar_spans: [{ substring: 'world', reason: 'grammar' }],
          rewritten_text: 'Hello planet',
        },
        tokens: 10,
        model: 'model1',
      }

      llmService.jsonCompletion.mockResolvedValue(mockLlmResponse)

      const result = await service.analyzePollText('hello world')

      expect(result.bias_spans.length).toBe(1)
      expect(result.grammar_spans.length).toBe(0)
    })

    it('sorts spans by start index', async () => {
      const mockLlmResponse = {
        object: {
          bias_spans: [
            { substring: 'world', reason: 'bias' },
            { substring: 'hello', reason: 'bias' },
          ],
          grammar_spans: [],
          rewritten_text: 'Test',
        },
        tokens: 10,
        model: 'model1',
      }

      llmService.jsonCompletion.mockResolvedValue(mockLlmResponse)

      const result = await service.analyzePollText('hello world')

      expect(result.bias_spans[0].start).toBeLessThan(
        result.bias_spans[1].start,
      )
    })

    it('handles whitespace variations in spans', async () => {
      const mockLlmResponse = {
        object: {
          bias_spans: [{ substring: 'hello    world', reason: 'bias' }],
          grammar_spans: [],
          rewritten_text: 'Test',
        },
        tokens: 10,
        model: 'model1',
      }

      llmService.jsonCompletion.mockResolvedValue(mockLlmResponse)

      const result = await service.analyzePollText('hello world')

      expect(result.bias_spans.length).toBeGreaterThan(0)
    })

    it('identifies validation errors correctly', async () => {
      vi.useFakeTimers()

      braintrustService.traced.mockImplementation(async (name, fn) => {
        try {
          return await fn()
        } catch (error) {
          throw error
        }
      })

      const validationErrorMessages = [
        'Failed to parse JSON',
        'Invalid response format',
        'Bias span validation failed',
        'ZodError: schema validation',
      ]

      const successResponse = {
        object: {
          bias_spans: [],
          grammar_spans: [],
          rewritten_text: 'Success',
        },
        tokens: 10,
        model: 'model1',
      }

      for (const errorMessage of validationErrorMessages) {
        const error = new Error(errorMessage)
        llmService.jsonCompletion.mockClear()
        llmService.jsonCompletion.mockRejectedValueOnce(error)
        llmService.jsonCompletion.mockResolvedValueOnce(successResponse)

        const resultPromise = service.analyzePollText('test')
        await vi.runAllTimersAsync()
        const result = await resultPromise

        expect(result.rewritten_text).toBe('Success')
      }

      vi.useRealTimers()
    })

    it('throws BadRequestException for empty poll text', async () => {
      await expect(service.analyzePollText('')).rejects.toThrow(
        BadRequestException,
      )
      await expect(service.analyzePollText('   ')).rejects.toThrow(
        BadRequestException,
      )
    })
  })
})
