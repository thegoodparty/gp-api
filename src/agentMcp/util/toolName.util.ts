export const deriveToolName = (method: string, path: string): string => {
  if (!path) {
    throw new Error('deriveToolName: path is required')
  }
  return `${method.toUpperCase()} ${path}`
}
