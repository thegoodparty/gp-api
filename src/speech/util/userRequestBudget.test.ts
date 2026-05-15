import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserRequestBudget } from './userRequestBudget'

describe('UserRequestBudget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-05-14T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('admits the first `limit` requests for a user', () => {
    const budget = new UserRequestBudget({ windowMs: 60_000, limit: 3 })
    expect(budget.tryAdmit(1)).toBe(true)
    expect(budget.tryAdmit(1)).toBe(true)
    expect(budget.tryAdmit(1)).toBe(true)
  })

  it('rejects requests above the limit within the window', () => {
    const budget = new UserRequestBudget({ windowMs: 60_000, limit: 2 })
    expect(budget.tryAdmit(7)).toBe(true)
    expect(budget.tryAdmit(7)).toBe(true)
    expect(budget.tryAdmit(7)).toBe(false)
  })

  it('admits again after old requests fall out of the window', () => {
    const budget = new UserRequestBudget({ windowMs: 60_000, limit: 1 })
    expect(budget.tryAdmit(42)).toBe(true)
    expect(budget.tryAdmit(42)).toBe(false)
    vi.advanceTimersByTime(60_001)
    expect(budget.tryAdmit(42)).toBe(true)
  })

  it('tracks each user independently', () => {
    const budget = new UserRequestBudget({ windowMs: 60_000, limit: 1 })
    expect(budget.tryAdmit(1)).toBe(true)
    expect(budget.tryAdmit(2)).toBe(true)
    expect(budget.tryAdmit(1)).toBe(false)
    expect(budget.tryAdmit(2)).toBe(false)
  })
})
