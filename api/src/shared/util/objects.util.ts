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

/** Deep merge two objects */
export function deepMerge(obj1: object, obj2: object) {
  const result = { ...obj1 } // Create a new object to avoid modifying the originals

  for (const key in obj2) {
    if (obj2.hasOwnProperty(key)) {
      if (typeof obj2[key] === 'object' && typeof obj1[key] === 'object') {
        // If both values are objects, recursively merge them
        result[key] = deepMerge(obj1[key], obj2[key])
      } else {
        // Otherwise, overwrite the value from obj1 with the value from obj2
        result[key] = obj2[key]
      }
    }
  }

  return result
}
