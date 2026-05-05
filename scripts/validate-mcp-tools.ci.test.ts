import { describe, expect, it, vi } from 'vitest'
import { PrismaService } from '../src/prisma/prisma.service'
import { runValidator } from './validate-mcp-tools'

describe('validate-mcp-tools (CI)', () => {
  it('every @McpTool handler in AppModule has both input and output schemas', async () => {
    vi.spyOn(PrismaService.prototype, 'onModuleInit').mockResolvedValue(
      undefined,
    )
    vi.spyOn(PrismaService.prototype, 'onModuleDestroy').mockResolvedValue(
      undefined,
    )

    const { missing } = await runValidator()

    if (missing.length > 0) {
      const lines = [
        `${missing.length} @McpTool-decorated route(s) failed schema validation:`,
      ]
      for (const { tool, reasons } of missing) {
        lines.push(`  ${tool.toolName}`)
        lines.push(`    at ${tool.controllerClassName}.${tool.handlerName}`)
        for (const r of reasons) lines.push(`      - ${r}`)
      }
      throw new Error(lines.join('\n'))
    }

    expect(missing).toHaveLength(0)
  }, 60_000)
})
