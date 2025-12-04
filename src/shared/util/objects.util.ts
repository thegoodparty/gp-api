/**
 * Flips an objects keys and values
 */
export function flip(obj: Record<string, string>): Record<string, string> {
  const ret: Record<string, string> = {}
  Object.keys(obj).forEach((key) => {
    ret[obj[key]] = key
  })
  return ret
}

/**
 * helper to get an object from a subset of another object's keys
 * @param {object} obj Source object
 * @param {string[]} keys Array of keys to pick
 * @returns {object}
 */
export const pick = (
  obj: { [key: string]: string | number | boolean | null },
  keys: string[],
): object => {
  if (typeof obj !== 'object' || obj === null || !Array.isArray(keys)) {
    throw new Error('invalid args')
  }

  return keys
    .filter((key) => key in obj)
    .reduce(
      (obj2, key) => ((obj2[key] = obj[key]), obj2),
      {} as Record<string, string | number | boolean | null>,
    )
}

// Similar to the above 'pick' helper, but with pickKeys() the compiler won't allow non-existent keys
// Additionally, type checking is retained after the call since the resulting object is structurally typed
export function pickKeys<
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  O extends Record<string, unknown>,
  K extends readonly (keyof O)[],
>(obj: O, keys: K): Pick<O, K[number]> {
  return Object.fromEntries(
    keys.flatMap((k) => (obj[k] === undefined ? [] : [[k, obj[k]]])),
  ) as Pick<O, K[number]>
}

export const objectNotEmpty = (obj: object) =>
  Boolean(obj && Object.values(obj).length > 0)
