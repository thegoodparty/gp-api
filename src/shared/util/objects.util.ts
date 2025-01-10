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
