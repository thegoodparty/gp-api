import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CustomEventType } from './newrelic.events'

const recordCustomEventAgentMock = vi.fn()
const addCustomAttributeAgentMock = vi.fn()
const addCustomAttributesAgentMock = vi.fn()

vi.mock('newrelic', () => ({
  recordCustomEvent: (...args: unknown[]) =>
    recordCustomEventAgentMock(...args),
  addCustomAttribute: (...args: unknown[]) =>
    addCustomAttributeAgentMock(...args),
  addCustomAttributes: (...args: unknown[]) =>
    addCustomAttributesAgentMock(...args),
}))

// Import after mocking `newrelic`
import {
  addCustomAttribute,
  addCustomAttributes,
  recordCustomEvent,
} from './newrelic.client'

describe('newrelic.client', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
    recordCustomEventAgentMock.mockClear()
    addCustomAttributeAgentMock.mockClear()
    addCustomAttributesAgentMock.mockClear()
  })

  it('no-ops when NEW_RELIC env vars are not set', () => {
    delete process.env.NEW_RELIC_APP_NAME
    delete process.env.NEW_RELIC_LICENSE_KEY

    recordCustomEvent(CustomEventType.BlockedState, {
      service: 'gp-api',
      userId: 1,
      rootCause: 'internal_unknown',
      isBackground: false,
    })

    addCustomAttribute('userId', 1)
    addCustomAttributes({ userId: 1 })

    expect(recordCustomEventAgentMock).not.toHaveBeenCalled()
    expect(addCustomAttributeAgentMock).not.toHaveBeenCalled()
    expect(addCustomAttributesAgentMock).not.toHaveBeenCalled()
  })

  it('records custom events when NEW_RELIC env vars are set', () => {
    process.env.NEW_RELIC_APP_NAME = 'gp-api'
    process.env.NEW_RELIC_LICENSE_KEY = 'test'

    recordCustomEvent(CustomEventType.BlockedState, {
      service: 'gp-api',
      userId: 1,
      rootCause: 'internal_unknown',
      isBackground: false,
      statusCode: 500,
      errorMessage: 'boom',
    })

    expect(recordCustomEventAgentMock).toHaveBeenCalledTimes(1)
  })

  it('filters non-primitive values from recordCustomEvent attributes', () => {
    process.env.NEW_RELIC_APP_NAME = 'gp-api'
    process.env.NEW_RELIC_LICENSE_KEY = 'test'

    recordCustomEvent(CustomEventType.BlockedState, {
      service: 'gp-api',
      userId: 1,
      rootCause: 'internal_unknown',
      isBackground: false,
      // @ts-expect-error: ensure runtime filtering protects us even if callers cast
      extra: { nested: true },
    })

    const [, attrs] = recordCustomEventAgentMock.mock.calls[0]
    expect(attrs).toMatchObject({ service: 'gp-api', userId: 1 })
    expect((attrs as Record<string, unknown>).extra).toBeUndefined()
  })

  it('drops non-primitive addCustomAttribute values', () => {
    process.env.NEW_RELIC_APP_NAME = 'gp-api'
    process.env.NEW_RELIC_LICENSE_KEY = 'test'

    addCustomAttribute('ok', 'yes')
    addCustomAttribute('bad', { nested: true })

    expect(addCustomAttributeAgentMock).toHaveBeenCalledTimes(1)
    expect(addCustomAttributeAgentMock.mock.calls[0][0]).toBe('ok')
  })

  it('filters non-primitive values from addCustomAttributes', () => {
    process.env.NEW_RELIC_APP_NAME = 'gp-api'
    process.env.NEW_RELIC_LICENSE_KEY = 'test'

    const inputAttrs: Record<string, unknown> = {
      ok: true,
      bad: { nested: true },
    }
    addCustomAttributes(inputAttrs)

    expect(addCustomAttributesAgentMock).toHaveBeenCalledTimes(1)
    const [recordedAttrs] = addCustomAttributesAgentMock.mock.calls[0]
    expect(recordedAttrs).toEqual({ ok: true })
  })
})
