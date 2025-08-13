import {
  DateFormats,
  DAY_OF_WEEK,
  findPreviousWeekDay,
  formatDate,
  getDateRangeWithDefaults,
  getMidnightForDate,
  parseIsoDateString,
} from './date.util'

describe('date.util', () => {
  it('formatDate formats', () => {
    const d = new Date(Date.UTC(2024, 0, 15))
    expect(formatDate(d, DateFormats.isoDate)).toBe('2024-01-15')
  })

  it('getMidnightForDate returns utc midnight', () => {
    const noon = new Date(Date.UTC(2024, 5, 1, 12, 0, 0))
    const midnight = getMidnightForDate(noon)
    expect(midnight.getUTCHours()).toBe(0)
    expect(midnight.getUTCMinutes()).toBe(0)
    expect(midnight.getUTCDate()).toBe(1)
  })

  it('findPreviousWeekDay returns correct day', () => {
    const end = new Date('2024-06-12T00:00:00Z')
    const prevSun = findPreviousWeekDay(end, DAY_OF_WEEK.SUNDAY)
    expect(prevSun.getUTCDay()).toBe(0)
  })

  it('parseIsoDateString parses yyyy-MM-dd', () => {
    const d = parseIsoDateString('2024-06-01')
    expect(d.getUTCFullYear()).toBe(2024)
    expect(d.getUTCMonth()).toBe(5)
    expect(d.getUTCDate()).toBe(1)
  })

  it('getDateRangeWithDefaults uses provided dates', () => {
    const start = new Date('2024-01-01T10:00:00Z')
    const end = new Date('2024-01-05T15:00:00Z')
    const { startDate, endDate } = getDateRangeWithDefaults(start, end)
    expect(startDate.getUTCHours()).toBe(0)
    expect(endDate.getUTCHours()).toBe(23)
  })
})


