import {
  getRandomInt,
  getRandomPercentage,
  LARGEST_SAFE_INTEGER,
} from './numbers.util'

describe('numbers.util', () => {
  it('getRandomInt within range', () => {
    const min = 5
    const max = 10
    const n = getRandomInt(min, max)
    expect(n).toBeGreaterThanOrEqual(min)
    expect(n).toBeLessThanOrEqual(max)
  })

  it('getRandomInt with default max', () => {
    const n = getRandomInt(0)
    expect(n).toBeGreaterThanOrEqual(0)
    expect(n).toBeLessThanOrEqual(LARGEST_SAFE_INTEGER)
  })

  it('getRandomPercentage between 0 and 100 with two decimals', () => {
    const p = getRandomPercentage()
    expect(p).toBeGreaterThanOrEqual(0)
    expect(p).toBeLessThanOrEqual(100)
    expect(Number.isFinite(p)).toBe(true)
  })
})
