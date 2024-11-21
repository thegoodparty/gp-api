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
