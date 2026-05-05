import { describe, expect, it } from 'vitest'
import { Test } from '@nestjs/testing'
import { Body, Controller, Get, Patch, Module } from '@nestjs/common'
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { McpTool } from '../decorators/McpTool.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { McpRegistryService } from './mcpRegistry.service'
import { AgentMcpModule } from '../agentMcp.module'

const InSchema = z.object({ slogan: z.string() })
class InDto extends createZodDto(InSchema) {}
const OutSchema = z.object({ ok: z.boolean() })

@Controller('campaigns')
class FakeController {
  @Get('mine')
  @ResponseSchema(OutSchema)
  @McpTool({ description: "Read the calling user's campaign." })
  read() {}

  @Patch('mine')
  @McpTool({ description: "Update the calling user's campaign." })
  @ResponseSchema(OutSchema)
  update(@Body() _b: InDto) {}

  @Get('untagged')
  notATool() {}
}

@Module({ imports: [AgentMcpModule], controllers: [FakeController] })
class FakeApp {}

describe('McpRegistryService', () => {
  it('discovers @McpTool-decorated handlers and builds tool entries', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeApp],
    }).compile()
    await moduleRef.init()

    const registry = moduleRef.get(McpRegistryService)
    const tools = registry.getAll()

    expect(tools).toHaveLength(2)

    const read = tools.find((t) => t.toolName === 'GET_campaigns_mine')!
    expect(read).toBeDefined()
    expect(read.description).toBe("Read the calling user's campaign.")
    expect(read.outputSchema).toBe(OutSchema)
    expect(read.inputSchema).toBeNull()

    const update = tools.find((t) => t.toolName === 'PATCH_campaigns_mine')!
    expect(update).toBeDefined()
    expect(update.inputSchema).not.toBeNull()
    expect(update.outputSchema).toBe(OutSchema)
  })

  it('does not include handlers without @McpTool', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeApp],
    }).compile()
    await moduleRef.init()

    const tools = moduleRef.get(McpRegistryService).getAll()
    expect(tools.find((t) => t.handlerName === 'notATool')).toBeUndefined()
  })

  it('throws when two handlers map to the same tool name', async () => {
    @Controller('campaigns')
    class DupController {
      @Get('mine')
      @McpTool({ description: 'First handler.' })
      first() {}

      @Get('mine')
      @McpTool({ description: 'Duplicate handler.' })
      second() {}
    }

    @Module({ imports: [AgentMcpModule], controllers: [DupController] })
    class DupApp {}

    const moduleRef = await Test.createTestingModule({
      imports: [DupApp],
    }).compile()

    await expect(moduleRef.init()).rejects.toThrow(/Duplicate MCP tool name/)
  })
})
