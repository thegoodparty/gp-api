import type { ZodSchema } from 'zod'

export type InputDeclaration = {
  declared: boolean
  schema: ZodSchema | null
}

export type RegisteredMcpTool = {
  toolName: string
  description: string
  method: string
  path: string
  inputDeclarations: {
    body: InputDeclaration
    query: InputDeclaration
    params: InputDeclaration
  }
  outputSchema: ZodSchema | null
  controllerClassName: string
  handlerName: string
}
