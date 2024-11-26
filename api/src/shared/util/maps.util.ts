export const mapToObject = (map: Map<string, any>): { [key: string]: any } =>
  Object.fromEntries(map)
