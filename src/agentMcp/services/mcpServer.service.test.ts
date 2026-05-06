/* eslint-disable @typescript-eslint/no-empty-function */
// Test fixtures define decorated controller stubs whose method bodies don't matter.
import { describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import { Body, Controller, Get, Patch, Module } from '@nestjs/common'
import { DiscoveryModule, HttpAdapterHost } from '@nestjs/core'
import { PinoLogger } from 'nestjs-pino'
import { z } from 'zod'
import { createZodDto } from 'nestjs-zod'
import { McpTool } from '../decorators/McpTool.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { createMockLogger } from '@/shared/test-utils/mockLogger.util'
import { McpServerService } from './mcpServer.service'

type InjectOpts = {
  method: string
  url: string
  headers?: Record<string, string>
  payload?: unknown
}

type InjectFn = (opts: InjectOpts) => Promise<{
  statusCode: number
  body: string
  headers: Record<string, string>
}>

const buildAppModule = (controllers: unknown[], inject: InjectFn) => {
  const mockHost = {
    httpAdapter: { getInstance: () => ({ inject }) },
  } as unknown as HttpAdapterHost

  @Module({
    imports: [DiscoveryModule],
    controllers: controllers as never[],
    providers: [
      McpServerService,
      { provide: HttpAdapterHost, useValue: mockHost },
      { provide: PinoLogger, useValue: createMockLogger() },
    ],
    exports: [McpServerService],
  })
  class TestApp {}

  return Test.createTestingModule({ imports: [TestApp] })
}

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

  @Get(':id')
  @ResponseSchema(OutSchema)
  @McpTool({ description: 'Read by id with no @Param decorator.' })
  readById() {}

  @Get('no-output')
  @McpTool({ description: 'no @ResponseSchema' })
  noOutput() {}
}

const noopInject: InjectFn = async () => ({
  statusCode: 200,
  body: '{}',
  headers: {},
})

describe('McpServerService.gatherTools', () => {
  it('discovers @McpTool-decorated handlers and builds tool entries', async () => {
    const moduleRef = await buildAppModule(
      [FakeController],
      noopInject,
    ).compile()
    await moduleRef.init()

    const tools = moduleRef.get(McpServerService).getTools()

    const read = tools.find((t) => t.toolName === 'GET_campaigns_mine')!
    expect(read).toBeDefined()
    expect(read.description).toBe("Read the calling user's campaign.")
    expect(read.outputSchema).toBe(OutSchema)
    expect(read.inputDeclarations.body.declared).toBe(false)
    expect(read.inputDeclarations.body.schema).toBeNull()
    expect(read.inputDeclarations.query.declared).toBe(false)
    expect(read.inputDeclarations.params.declared).toBe(false)

    const update = tools.find((t) => t.toolName === 'PATCH_campaigns_mine')!
    expect(update).toBeDefined()
    expect(update.outputSchema).toBe(OutSchema)
    expect(update.inputDeclarations.body.declared).toBe(true)
    expect(update.inputDeclarations.body.schema).toBe(InSchema)
    expect(update.inputDeclarations.params.declared).toBe(false)
  })

  it('marks params declared from path :placeholder even when @Param is missing', async () => {
    const moduleRef = await buildAppModule(
      [FakeController],
      noopInject,
    ).compile()
    await moduleRef.init()

    const tools = moduleRef.get(McpServerService).getTools()
    const readById = tools.find((t) => t.handlerName === 'readById')!
    expect(readById).toBeDefined()
    expect(readById.inputDeclarations.params.declared).toBe(true)
    expect(readById.inputDeclarations.params.schema).toBeNull()
  })

  it('does not include handlers without @McpTool', async () => {
    const moduleRef = await buildAppModule(
      [FakeController],
      noopInject,
    ).compile()
    await moduleRef.init()

    const tools = moduleRef.get(McpServerService).getTools()
    expect(tools.find((t) => t.handlerName === 'notATool')).toBeUndefined()
  })

  it('registers tools without @ResponseSchema with outputSchema null', async () => {
    const moduleRef = await buildAppModule(
      [FakeController],
      noopInject,
    ).compile()
    await moduleRef.init()

    const tools = moduleRef.get(McpServerService).getTools()
    const noOutput = tools.find((t) => t.handlerName === 'noOutput')!
    expect(noOutput).toBeDefined()
    expect(noOutput.outputSchema).toBeNull()
  })

  it('throws when @McpTool is applied to a handler with no HTTP method decorator', async () => {
    @Controller('campaigns')
    class NoHttpController {
      @McpTool({ description: 'helper, not a route' })
      helper() {}
    }

    const moduleRef = await buildAppModule(
      [NoHttpController],
      noopInject,
    ).compile()
    await moduleRef.init()

    expect(() => moduleRef.get(McpServerService).getTools()).toThrow(
      /has no HTTP method decorator/,
    )
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

    const moduleRef = await buildAppModule(
      [DupController],
      noopInject,
    ).compile()
    await moduleRef.init()

    expect(() => moduleRef.get(McpServerService).getTools()).toThrow(
      /Duplicate MCP tool name/,
    )
  })
})

@Controller('v1')
class FooController {
  @Get('foo')
  @ResponseSchema(z.object({ ok: z.boolean() }))
  @McpTool({ description: 'read foo' })
  read() {}

  @Patch('foo')
  @ResponseSchema(z.object({ ok: z.boolean() }))
  @McpTool({ description: 'write foo' })
  write(@Body() _b: InDto) {}
}

describe('McpServerService MCP request handlers', () => {
  it('exposes list_tools that returns tool entries with JSON Schema input shapes', async () => {
    const moduleRef = await buildAppModule(
      [FooController],
      noopInject,
    ).compile()
    await moduleRef.init()

    const svc = moduleRef.get(McpServerService)
    const server = svc.getServer() as unknown as {
      _requestHandlers: Map<
        string,
        (req: unknown, extra?: unknown) => Promise<unknown>
      >
    }
    const listHandler = server._requestHandlers.get('tools/list')
    expect(listHandler).toBeDefined()
    const result = (await listHandler!({
      method: 'tools/list',
      params: {},
    })) as {
      tools: Array<{
        name: string
        description: string
        inputSchema: { type: string; properties?: Record<string, unknown> }
      }>
    }
    expect(result.tools).toHaveLength(2)

    const get = result.tools.find((t) => t.name === 'GET_v1_foo')!
    expect(get.inputSchema.type).toBe('object')
    expect(get.inputSchema.properties).toEqual({})

    const post = result.tools.find((t) => t.name === 'PATCH_v1_foo')!
    expect(post.description).toBe('write foo')
    expect(post.inputSchema.type).toBe('object')
    expect(post.inputSchema.properties).toBeDefined()
    expect(Object.keys(post.inputSchema.properties!)).toContain('body')
  })

  it('routes call_tool through fastify.inject with method + path and forwards Authorization', async () => {
    const calls: InjectOpts[] = []
    const inject = vi.fn(async (opts: InjectOpts) => {
      calls.push(opts)
      return {
        statusCode: 200,
        body: '{"ok":true}',
        headers: { 'content-type': 'application/json' },
      }
    })
    const moduleRef = await buildAppModule([FooController], inject).compile()
    await moduleRef.init()

    const svc = moduleRef.get(McpServerService)
    const server = svc.getServer() as unknown as {
      _requestHandlers: Map<
        string,
        (req: unknown, extra?: unknown) => Promise<unknown>
      >
    }
    const callHandler = server._requestHandlers.get('tools/call')!
    const result = (await callHandler(
      {
        method: 'tools/call',
        params: { name: 'PATCH_v1_foo', arguments: { body: { slogan: 'x' } } },
      },
      {
        requestInfo: {
          headers: { authorization: 'Bearer test-jwt' },
        },
      },
    )) as { isError: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('PATCH')
    expect(calls[0].url).toBe('/v1/foo')
    expect(calls[0].payload).toEqual({ slogan: 'x' })
    expect(calls[0].headers?.authorization).toBe('Bearer test-jwt')
    expect(result.content[0].text).toBe('{"ok":true}')
  })

  it('still calls fastify.inject when no Authorization header is present', async () => {
    const calls: InjectOpts[] = []
    const inject = vi.fn(async (opts: InjectOpts) => {
      calls.push(opts)
      return {
        statusCode: 401,
        body: '{"error":"unauthorized"}',
        headers: { 'content-type': 'application/json' },
      }
    })
    const moduleRef = await buildAppModule([FooController], inject).compile()
    await moduleRef.init()

    const svc = moduleRef.get(McpServerService)
    const server = svc.getServer() as unknown as {
      _requestHandlers: Map<
        string,
        (req: unknown, extra?: unknown) => Promise<unknown>
      >
    }
    const callHandler = server._requestHandlers.get('tools/call')!
    await callHandler({
      method: 'tools/call',
      params: { name: 'PATCH_v1_foo', arguments: { body: { slogan: 'x' } } },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].headers?.authorization).toBeUndefined()
  })

  it('returns isError when the upstream returns 4xx', async () => {
    const moduleRef = await buildAppModule([FooController], async () => ({
      statusCode: 400,
      body: '{"error":"bad"}',
      headers: { 'content-type': 'application/json' },
    })).compile()
    await moduleRef.init()

    const svc = moduleRef.get(McpServerService)
    const server = svc.getServer() as unknown as {
      _requestHandlers: Map<
        string,
        (req: unknown, extra?: unknown) => Promise<unknown>
      >
    }
    const callHandler = server._requestHandlers.get('tools/call')!
    const result = (await callHandler({
      method: 'tools/call',
      params: { name: 'GET_v1_foo', arguments: {} },
    })) as { isError: boolean }
    expect(result.isError).toBe(true)
  })

  it('returns isError for unknown tool', async () => {
    const moduleRef = await buildAppModule(
      [FooController],
      noopInject,
    ).compile()
    await moduleRef.init()

    const svc = moduleRef.get(McpServerService)
    const server = svc.getServer() as unknown as {
      _requestHandlers: Map<
        string,
        (req: unknown, extra?: unknown) => Promise<unknown>
      >
    }
    const callHandler = server._requestHandlers.get('tools/call')!
    const result = (await callHandler({
      method: 'tools/call',
      params: { name: 'DOES_NOT_EXIST', arguments: {} },
    })) as { isError: boolean }
    expect(result.isError).toBe(true)
  })
})
