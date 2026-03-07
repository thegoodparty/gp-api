import { describe, expect, it } from 'vitest'
import { deriveRootCause, shouldRecordBlockedState } from './blockedState.rules'

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

describe('deriveRootCause', () => {
  it('prioritizes allowlisted data-integrity errorCode over dependency message', () => {
    expect(
      deriveRootCause({
        statusCode: 400,
        errorMessage: 'Transaction API error: missing district metadata',
        errorCode: 'DATA_INTEGRITY_P2V_ELECTION_INFO_MISSING',
      }),
    ).toBe('data_integrity_campaign')
  })

  it('maps Transaction API failures to dependency_transaction_api', () => {
    expect(
      deriveRootCause({
        statusCode: 500,
        errorMessage: 'Transaction API error: upstream returned 400',
      }),
    ).toBe('dependency_transaction_api')
  })

  it('falls back to internal_unknown for unknown errors', () => {
    expect(
      deriveRootCause({
        statusCode: 500,
        errorMessage: 'something else failed',
      }),
    ).toBe('internal_unknown')
  })
})
