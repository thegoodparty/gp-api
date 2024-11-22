export const mapToObject = (map: Map<string, any>): { [key: string]: any } =>
  [...map.entries()].reduce(
    (obj, [key, value]) => ({
      ...obj,
      [key]: value,
    }),
    {},
  )
