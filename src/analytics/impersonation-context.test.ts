import { describe, expect, it } from 'vitest'
import {
  getImpersonationContext,
  runWithImpersonation,
} from './impersonation-context'

describe('impersonation-context', () => {
  describe('getImpersonationContext', () => {
    it('returns undefined when called outside runWithImpersonation', () => {
      expect(getImpersonationContext()).toBeUndefined()
    })

    it('returns true when run inside runWithImpersonation(true)', () => {
      runWithImpersonation(true, () => {
        expect(getImpersonationContext()).toBe(true)
      })
    })

    it('returns false when run inside runWithImpersonation(false)', () => {
      runWithImpersonation(false, () => {
        expect(getImpersonationContext()).toBe(false)
      })
    })
  })

  describe('runWithImpersonation', () => {
    it('returns the value from the callback', () => {
      const result = runWithImpersonation(true, () => 'hello')
      expect(result).toBe('hello')
    })

    it('does not leak context outside the callback', () => {
      runWithImpersonation(true, () => {
        expect(getImpersonationContext()).toBe(true)
      })
      expect(getImpersonationContext()).toBeUndefined()
    })

    it('supports nested calls with different values', () => {
      runWithImpersonation(true, () => {
        expect(getImpersonationContext()).toBe(true)
        runWithImpersonation(false, () => {
          expect(getImpersonationContext()).toBe(false)
        })
        expect(getImpersonationContext()).toBe(true)
      })
    })
  })
})
