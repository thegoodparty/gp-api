import { describe, expect, it } from 'vitest'
import { Test } from '@nestjs/testing'
import { Body, Controller, Get, Module } from '@nestjs/common'
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { McpTool } from '../src/agentMcp/decorators/McpTool.decorator'
import { ResponseSchema } from '../src/shared/decorators/ResponseSchema.decorator'
import { AgentMcpModule } from '../src/agentMcp/agentMcp.module'
import { McpRegistryService } from '../src/agentMcp/services/mcpRegistry.service'
import { findMissingSchemas } from './validate-mcp-tools'

const Out = z.object({ ok: z.boolean() })
const In = z.object({ x: z.string() })
class InDto extends createZodDto(In) {}

@Controller('good')
class GoodController {
  @Get('one')
  @ResponseSchema(Out)
  @McpTool({ description: 'fine' })
  one() {}

  @Get('two')
  @ResponseSchema(Out)
  @McpTool({ description: 'fine, with body' })
  two(@Body() _b: InDto) {}
}

@Controller('bad')
class BadController {
  @Get('no-output')
  @McpTool({ description: 'missing output' })
  noOutput() {}
}

describe('validate-mcp-tools logic', () => {
  it('flags a tool missing @ResponseSchema', async () => {
    @Module({
      imports: [AgentMcpModule],
      controllers: [GoodController, BadController],
    })
    class TestApp {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestApp],
    }).compile()
    await moduleRef.init()
    const registry = moduleRef.get(McpRegistryService)
    const result = findMissingSchemas(registry.getAll())
    expect(result).toHaveLength(2)
    const noOutput = result.find((r) => r.tool.handlerName === 'noOutput')
    expect(noOutput).toBeDefined()
    expect(noOutput!.reasons).toContain('missing @ResponseSchema(...)')
    const one = result.find((r) => r.tool.handlerName === 'one')
    expect(one).toBeDefined()
    expect(one!.reasons).toContain(
      'missing input schema (no @Body/@Query/@Param Zod DTO)',
    )
  })

  it('does not flag a handler that has both input and output schemas', async () => {
    @Module({ imports: [AgentMcpModule], controllers: [GoodController] })
    class TestApp {}

    const moduleRef = await Test.createTestingModule({
      imports: [TestApp],
    }).compile()
    await moduleRef.init()
    const registry = moduleRef.get(McpRegistryService)
    const result = findMissingSchemas(registry.getAll())
    expect(result.find((r) => r.tool.handlerName === 'two')).toBeUndefined()
  })
})
