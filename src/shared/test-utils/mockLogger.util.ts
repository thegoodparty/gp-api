import { Logger } from '@nestjs/common'
import { vi } from 'vitest'

export function createMockLogger(): Logger {
  const logger = new Logger('Test')
  vi.spyOn(logger, 'warn').mockImplementation(() => {})
  vi.spyOn(logger, 'error').mockImplementation(() => {})
  vi.spyOn(logger, 'debug').mockImplementation(() => {})
  vi.spyOn(logger, 'log').mockImplementation(() => {})
  return logger
}
