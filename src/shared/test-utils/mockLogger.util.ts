import { PinoLogger } from 'nestjs-pino'
import { vi } from 'vitest'

export const createMockLogger = (): PinoLogger =>
  ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    assign: vi.fn(),
    setContext: vi.fn(),
  }) as unknown as PinoLogger
