import { describe, expect, it } from 'vitest'
import { shouldRecordBlockedState } from './blockedState.rules'

describe('shouldRecordBlockedState', () => {
  it('records any 5xx', () => {
    expect(
      shouldRecordBlockedState({ statusCode: 500, errorMessage: 'x' }),
    ).toBe(true)
    expect(
      shouldRecordBlockedState({ statusCode: 503, errorMessage: 'x' }),
    ).toBe(true)
  })

  it('does not record non-error status codes', () => {
    expect(
      shouldRecordBlockedState({ statusCode: 200, errorMessage: 'x' }),
    ).toBe(false)
    expect(
      shouldRecordBlockedState({ statusCode: 302, errorMessage: 'x' }),
    ).toBe(false)
  })

  it('records allowlisted 4xx only when errorCode is allowlisted', () => {
    expect(
      shouldRecordBlockedState({
        statusCode: 400,
        errorMessage: 'x',
        errorCode: 'DATA_INTEGRITY_P2V_ELECTION_INFO_MISSING',
      }),
    ).toBe(true)

    expect(
      shouldRecordBlockedState({
        statusCode: 400,
        errorMessage: 'x',
        errorCode: 'NOT_ALLOWLISTED',
      }),
    ).toBe(false)

    expect(
      shouldRecordBlockedState({
        statusCode: 400,
        errorMessage: 'x',
      }),
    ).toBe(false)
  })
})
