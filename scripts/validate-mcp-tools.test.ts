/* eslint-disable @typescript-eslint/no-empty-function */
// Test fixtures define decorated controller stubs whose method bodies don't matter.
import { describe, expect, it } from 'vitest'
import { Test } from '@nestjs/testing'
import { Body, Controller, Get, Module } from '@nestjs/common'
import { DiscoveryModule, HttpAdapterHost } from '@nestjs/core'
import { PinoLogger } from 'nestjs-pino'
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { McpTool } from '../src/agentMcp/decorators/McpTool.decorator'
import { ResponseSchema } from '../src/shared/decorators/ResponseSchema.decorator'
import { McpServerService } from '../src/agentMcp/services/mcpServer.service'
import { createMockLogger } from '../src/shared/test-utils/mockLogger.util'
import { findMissingSchemas } from './validate-mcp-tools'

const fakeHost = {
  httpAdapter: { getInstance: () => ({ inject: async () => undefined }) },
} as unknown as HttpAdapterHost

const buildAppModule = (controllers: unknown[]) => {
  @Module({
    imports: [DiscoveryModule],
    controllers: controllers as never[],
    providers: [
      McpServerService,
      { provide: HttpAdapterHost, useValue: fakeHost },
      { provide: PinoLogger, useValue: createMockLogger() },
    ],
    exports: [McpServerService],
  })
  class TestApp {}

  return Test.createTestingModule({ imports: [TestApp] })
}

const Out = z.object({ ok: z.boolean() })
const In = z.object({ x: z.string() })
class InDto extends createZodDto(In) {}

@Controller('good')
class GoodController {
  @Get('one')
  @ResponseSchema(Out)
  @McpTool({ description: 'fine, no inputs' })
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

  @Get('untyped-body')
  @ResponseSchema(Out)
  @McpTool({ description: 'body declared without a Zod DTO' })
  untypedBody(@Body() _b: object) {}

  @Get(':id')
  @ResponseSchema(Out)
  @McpTool({ description: 'path placeholder without @Param Zod DTO' })
  paramFromPath() {}
}

describe('validate-mcp-tools logic', () => {
  it('flags handlers missing @ResponseSchema and ones whose declared inputs lack a Zod DTO', async () => {
    const moduleRef = await buildAppModule([
      GoodController,
      BadController,
    ]).compile()
    await moduleRef.init()
    const tools = moduleRef.get(McpServerService).getTools()
    const result = findMissingSchemas(tools)

    const noOutput = result.find((r) => r.tool.handlerName === 'noOutput')
    expect(noOutput).toBeDefined()
    expect(noOutput!.reasons).toContain('missing @ResponseSchema(...)')

    const untypedBody = result.find((r) => r.tool.handlerName === 'untypedBody')
    expect(untypedBody).toBeDefined()
    expect(untypedBody!.reasons).toContain(
      '@Body declared but is not a nestjs-zod createZodDto class',
    )

    const paramFromPath = result.find(
      (r) => r.tool.handlerName === 'paramFromPath',
    )
    expect(paramFromPath).toBeDefined()
    expect(paramFromPath!.reasons).toContain(
      '@Param or path :placeholder is present but no nestjs-zod createZodDto provides a Zod schema',
    )
  })

  it('does not flag a handler with no inputs at all and a valid @ResponseSchema', async () => {
    const moduleRef = await buildAppModule([GoodController]).compile()
    await moduleRef.init()
    const tools = moduleRef.get(McpServerService).getTools()
    const result = findMissingSchemas(tools)
    expect(result.find((r) => r.tool.handlerName === 'one')).toBeUndefined()
    expect(result.find((r) => r.tool.handlerName === 'two')).toBeUndefined()
  })
})
