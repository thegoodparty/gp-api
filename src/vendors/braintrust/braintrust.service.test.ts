import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as braintrust from 'braintrust'
import { BraintrustService } from './braintrust.service'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'

vi.mock('braintrust', async (importOriginal) => {
  const actual = await importOriginal<typeof braintrust>()
  return {
    ...actual,
    initLogger: vi.fn(),
    traced: vi.fn(),
  }
})

describe('BraintrustService.tracedNested', () => {
  const originalApiKey = process.env.BRAINTRUST_API_KEY

  afterEach(() => {
    process.env.BRAINTRUST_API_KEY = originalApiKey
    vi.clearAllMocks()
  })

  describe('when Braintrust is disabled', () => {
    beforeEach(() => {
      delete process.env.BRAINTRUST_API_KEY
    })

    it('calls the function directly without tracing', async () => {
      const service = new BraintrustService(createMockLogger())
      const fn = vi.fn().mockResolvedValue('result')

      const result = await service.tracedNested('test', fn)

      expect(result).toBe('result')
      expect(fn).toHaveBeenCalledTimes(1)
      expect(braintrust.traced).not.toHaveBeenCalled()
    })

    it('propagates errors from the function', async () => {
      const service = new BraintrustService(createMockLogger())
      const fn = vi.fn().mockRejectedValue(new Error('fn failed'))

      await expect(service.tracedNested('test', fn)).rejects.toThrow(
        'fn failed',
      )
    })
  })

  describe('when Braintrust is enabled', () => {
    beforeEach(() => {
      process.env.BRAINTRUST_API_KEY = 'test-key'
      vi.mocked(braintrust.initLogger).mockReturnValue(
        // SDK constructor returns the Logger class; we only need a non-null sentinel.
        {} as ReturnType<typeof braintrust.initLogger>,
      )
    })

    it('wraps fn in braintrust.traced with name and type', async () => {
      vi.mocked(braintrust.traced).mockImplementation(async (callback) => {
        const fakeSpan = { log: vi.fn() }
        return callback(fakeSpan as unknown as braintrust.Span)
      })

      const service = new BraintrustService(createMockLogger())
      const fn = vi.fn().mockResolvedValue('ok')

      const result = await service.tracedNested('parent-pipeline', fn, {
        input: { foo: 'bar' },
        metadata: { pipeline: 'opportunities' },
        type: 'task',
      })

      expect(result).toBe('ok')
      expect(braintrust.traced).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ name: 'parent-pipeline', type: 'task' }),
      )
    })

    it('omits type when not provided so SDK uses default', async () => {
      vi.mocked(braintrust.traced).mockImplementation(async (callback) => {
        const fakeSpan = { log: vi.fn() }
        return callback(fakeSpan as unknown as braintrust.Span)
      })

      const service = new BraintrustService(createMockLogger())
      await service.tracedNested('plain', vi.fn().mockResolvedValue('x'))

      const args = vi.mocked(braintrust.traced).mock.calls[0][1]
      expect(args).toEqual({ name: 'plain' })
    })

    it('logs input and output to the span', async () => {
      const spanLog = vi.fn()
      vi.mocked(braintrust.traced).mockImplementation(async (callback) => {
        return callback({ log: spanLog } as unknown as braintrust.Span)
      })

      const service = new BraintrustService(createMockLogger())
      await service.tracedNested('logged', () => ({ value: 42 }), {
        input: { prompt: 'hi' },
        metadata: { foo: 'bar' },
      })

      expect(spanLog).toHaveBeenCalledWith(
        expect.objectContaining({
          input: { prompt: 'hi' },
          output: { value: 42 },
          metadata: expect.objectContaining({ foo: 'bar' }),
        }),
      )
    })

    it('logs error and re-throws when fn fails', async () => {
      const spanLog = vi.fn()
      vi.mocked(braintrust.traced).mockImplementation(async (callback) => {
        return callback({ log: spanLog } as unknown as braintrust.Span)
      })

      const service = new BraintrustService(createMockLogger())
      const fn = vi.fn().mockRejectedValue(new Error('boom'))

      await expect(service.tracedNested('fails', fn)).rejects.toThrow('boom')

      expect(spanLog).toHaveBeenCalledWith(
        expect.objectContaining({
          output: expect.objectContaining({
            error: 'boom',
            success: false,
          }),
        }),
      )
    })

    it('returns fn result when tracing system itself fails after fn ran', async () => {
      vi.mocked(braintrust.traced).mockImplementation(async (callback) => {
        const fakeSpan = { log: vi.fn() }
        await callback(fakeSpan as unknown as braintrust.Span)
        throw new Error('tracing layer crashed')
      })

      const service = new BraintrustService(createMockLogger())
      const fn = vi.fn().mockResolvedValue('preserved')

      const result = await service.tracedNested('tracing-fails', fn)

      expect(result).toBe('preserved')
    })
  })
})
