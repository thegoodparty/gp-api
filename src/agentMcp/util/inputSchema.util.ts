import { z, ZodSchema } from 'zod'
import type { RegisteredMcpTool } from '../agentMcp.types'

export const buildCombinedInputSchema = (
  decls: RegisteredMcpTool['inputDeclarations'],
): ZodSchema | null => {
  const obj: Record<string, ZodSchema> = {}
  if (decls.body.schema) obj.body = decls.body.schema
  if (decls.query.schema) obj.query = decls.query.schema
  if (decls.params.schema) obj.params = decls.params.schema
  if (Object.keys(obj).length === 0) return null
  return z.object(obj)
}
