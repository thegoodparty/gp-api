export const formatDateForCRM = (date: string | number | undefined | null) => {
  if (!date) return undefined

  if (typeof date === 'string') {
    const trimmedDate = date.trim()
    if (!trimmedDate) return undefined

    const dateObj = new Date(trimmedDate)
    if (isNaN(dateObj.getTime())) return undefined

    // Set to start of day in UTC
    const utcStartOfDay = new Date(
      Date.UTC(
        dateObj.getUTCFullYear(),
        dateObj.getUTCMonth(),
        dateObj.getUTCDate(),
        0,
        0,
        0,
        0,
      ),
    )
    return utcStartOfDay.getTime().toString()
  }

  const dateObj = new Date(date)
  if (isNaN(dateObj.getTime())) return undefined

  // Set to start of day in UTC
  const utcStartOfDay = new Date(
    Date.UTC(
      dateObj.getUTCFullYear(),
      dateObj.getUTCMonth(),
      dateObj.getUTCDate(),
      0,
      0,
      0,
      0,
    ),
  )
  return utcStartOfDay.getTime().toString()
}
