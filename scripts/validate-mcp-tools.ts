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
  process.env.QUEUE_CONSUMER_DISABLED = 'true'
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

const main = async () => {
  const { tools, missing } = await runValidator()

  if (missing.length === 0) {
    console.log(
      `OK ${tools.length} @McpTool-decorated routes pass schema validation`,
    )
    process.exit(0)
  }

  console.error(
    `FAIL ${missing.length} @McpTool-decorated route(s) failed schema validation:\n`,
  )
  for (const { tool, reasons } of missing) {
    console.error(`  ${tool.toolName}`)
    console.error(`    at ${tool.controllerClassName}.${tool.handlerName}`)
    for (const r of reasons) console.error(`      - ${r}`)
    console.error('')
  }
  process.exit(1)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
