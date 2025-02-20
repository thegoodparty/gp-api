/**
 * Flips an objects keys and values
 */
export function flip(obj: Record<any, any>): Record<any, any> {
  const ret = {}
  Object.keys(obj).forEach((key) => {
    ret[obj[key]] = key
  })
  return ret
}

/** helper to check if a value is an object */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * helper to get an object from a subset of another object's keys
 * @param {object} obj Source object
 * @param {string[]} keys Array of keys to pick
 * @returns {object}
 */
export const pick = (obj: { [key: string]: any }, keys: string[]): object => {
  if (typeof obj !== 'object' || obj === null || !Array.isArray(keys)) {
    throw new Error('invalid args')
  }

  return keys
    .filter((key) => key in obj)
    .reduce((obj2, key) => ((obj2[key] = obj[key]), obj2), {})
}
export const objectNotEmpty = (obj: object) =>
  Boolean(obj && Object.values(obj).length > 0)
