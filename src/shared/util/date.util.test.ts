import { describe, expect, it } from 'vitest'
import { parseIsoDateAsUTC } from './date.util'

describe('parseIsoDateAsUTC', () => {
  // Asserting against Date.UTC(...) makes these checks TZ-independent —
  // they fail in *any* non-UTC test runner if the parser drifts to local
  // time. (Asserting only `getUTCMonth` etc. would falsely pass on a UTC
  // host even if the parser were broken, defeating the regression guard.)

  it('parses date-only "YYYY-MM-DD" as UTC midnight', () => {
    const d = parseIsoDateAsUTC('2026-11-03')
    expect(d.getTime()).toBe(Date.UTC(2026, 10, 3))
  })

  it('preserves the calendar month at the month boundary (Nov 1)', () => {
    const d = parseIsoDateAsUTC('2026-11-01')
    expect(d.getTime()).toBe(Date.UTC(2026, 10, 1))
  })

  it('preserves the calendar year at the year boundary (Jan 1)', () => {
    const d = parseIsoDateAsUTC('2026-01-01')
    expect(d.getTime()).toBe(Date.UTC(2026, 0, 1))
  })

  it('passes through strings that already carry a TZ offset', () => {
    const d = parseIsoDateAsUTC('2026-11-03T10:30:00Z')
    expect(d.getTime()).toBe(Date.UTC(2026, 10, 3, 10, 30, 0))
  })
})
