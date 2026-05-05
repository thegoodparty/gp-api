import type { ZodSchema } from 'zod'

export type RegisteredMcpTool = {
  toolName: string
  description: string
  method: string
  path: string
  inputSchema: ZodSchema | null
  outputSchema: ZodSchema | null
  controllerClassName: string
  handlerName: string
}
