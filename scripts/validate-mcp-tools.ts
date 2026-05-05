import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '../src/app.module'
import { McpRegistryService } from '../src/agentMcp/services/mcpRegistry.service'
import { RegisteredMcpTool } from '../src/agentMcp/agentMcp.types'

export type MissingEntry = {
  tool: RegisteredMcpTool
  reasons: string[]
}

export const findMissingSchemas = (
  tools: readonly RegisteredMcpTool[],
): MissingEntry[] =>
  tools
    .map((t) => {
      const reasons: string[] = []
      if (!t.inputSchema)
        reasons.push('missing input schema (no @Body/@Query/@Param Zod DTO)')
      if (!t.outputSchema) reasons.push('missing @ResponseSchema(...)')
      return reasons.length ? { tool: t, reasons } : null
    })
    .filter((x): x is MissingEntry => x !== null)

export const runValidator = async () => {
  process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error'],
  })
  await app.init()

  const registry = app.get(McpRegistryService)
  const tools = registry.getAll()
  const missing = findMissingSchemas(tools)

  await app.close()

  return { tools, missing }
}
