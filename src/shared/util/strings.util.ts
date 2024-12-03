export const trimMany = (strings: {
  [key: string]: string
}): { [key: string]: string } =>
  Object.entries(strings).reduce(
    (acc, [key, value = '']) => ({
      ...acc,
      [key]: value.trim(),
    }),
    {},
  )

export const toLowerAndTrim = (str: string = '') => str.trim().toLowerCase()
