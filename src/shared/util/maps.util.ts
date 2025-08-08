// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mapToObject = (map: Map<string, any>): { [key: string]: any } =>
  Object.fromEntries(map)
