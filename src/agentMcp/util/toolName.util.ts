export const deriveToolName = (method: string, path: string): string => {
  if (!path) {
    throw new Error('deriveToolName: path is required')
  }
  const slug = path.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `${method.toUpperCase()}_${slug}`
}
