import { describe, expect, it, vi } from 'vitest'
import { Test } from '@nestjs/testing'
import { HttpAdapterHost } from '@nestjs/core'
import { z } from 'zod'
import { McpServerService } from './mcpServer.service'
import { McpRegistryService } from './mcpRegistry.service'
import { RegisteredMcpTool } from '../agentMcp.types'

const fakeReadTool: RegisteredMcpTool = {
  toolName: 'GET_v1_foo',
  description: 'read foo',
  method: 'GET',
  path: '/v1/foo',
  inputSchema: null,
  outputSchema: z.object({ ok: z.boolean() }),
  controllerClassName: 'FooController',
  handlerName: 'read',
}

const fakeWriteTool: RegisteredMcpTool = {
  toolName: 'POST_v1_foo',
  description: 'write foo',
  method: 'POST',
  path: '/v1/foo',
  inputSchema: z.object({ body: z.object({ value: z.string() }) }),
  outputSchema: z.object({ ok: z.boolean() }),
  controllerClassName: 'FooController',
  handlerName: 'write',
}

const buildModule = async (
  inject: (opts: {
    method: string
    url: string
    payload?: unknown
  }) => Promise<{
    statusCode: number
    body: string
    headers: Record<string, string>
  }>,
) => {
  const mockRegistry = {
    getAll: () => [fakeReadTool, fakeWriteTool],
    findByToolName: (n: string) =>
      n === fakeReadTool.toolName
        ? fakeReadTool
        : n === fakeWriteTool.toolName
          ? fakeWriteTool
          : undefined,
  }
  const mockHost = {
    httpAdapter: { getInstance: () => ({ inject }) },
  } as unknown as HttpAdapterHost

  return Test.createTestingModule({
    providers: [
      McpServerService,
      { provide: McpRegistryService, useValue: mockRegistry },
      { provide: HttpAdapterHost, useValue: mockHost },
    ],
  }).compile()
}

describe('McpServerService', () => {
  it('exposes list_tools that returns registry entries with JSON Schema input shapes', async () => {
    const moduleRef = await buildModule(async () => ({
      statusCode: 200,
      body: '{}',
      headers: {},
    }))
    const svc = moduleRef.get(McpServerService)
    const server = svc.getServer() as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>
    }
    const listHandler = server._requestHandlers.get('tools/list')
    expect(listHandler).toBeDefined()
    const result = (await listHandler!({
      method: 'tools/list',
      params: {},
    })) as {
      tools: Array<{ name: string; description: string; inputSchema: unknown }>
    }
    expect(result.tools).toHaveLength(2)
    const post = result.tools.find((t) => t.name === 'POST_v1_foo')!
    expect(post.description).toBe('write foo')
    expect((post.inputSchema as { type: string }).type).toBe('object')
  })

  it('routes call_tool through fastify.inject with method + path', async () => {
    const calls: { method: string; url: string; payload?: unknown }[] = []
    const inject = vi.fn(
      async (opts: { method: string; url: string; payload?: unknown }) => {
        calls.push(opts)
        return {
          statusCode: 200,
          body: '{"ok":true}',
          headers: { 'content-type': 'application/json' },
        }
      },
    )
    const moduleRef = await buildModule(inject)
    const svc = moduleRef.get(McpServerService)
    const server = svc.getServer() as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>
    }
    const callHandler = server._requestHandlers.get('tools/call')!
    const result = (await callHandler({
      method: 'tools/call',
      params: { name: 'POST_v1_foo', arguments: { body: { value: 'x' } } },
    })) as { isError: boolean; content: Array<{ text: string }> }
    expect(result.isError).toBe(false)
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('POST')
    expect(calls[0].url).toBe('/v1/foo')
    expect(calls[0].payload).toEqual({ value: 'x' })
    expect(result.content[0].text).toBe('{"ok":true}')
  })

  it('returns isError when the upstream returns 4xx', async () => {
    const moduleRef = await buildModule(async () => ({
      statusCode: 400,
      body: '{"error":"bad"}',
      headers: { 'content-type': 'application/json' },
    }))
    const svc = moduleRef.get(McpServerService)
    const server = svc.getServer() as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>
    }
    const callHandler = server._requestHandlers.get('tools/call')!
    const result = (await callHandler({
      method: 'tools/call',
      params: { name: 'GET_v1_foo', arguments: {} },
    })) as { isError: boolean }
    expect(result.isError).toBe(true)
  })

  it('returns isError for unknown tool', async () => {
    const moduleRef = await buildModule(async () => ({
      statusCode: 200,
      body: '{}',
      headers: {},
    }))
    const svc = moduleRef.get(McpServerService)
    const server = svc.getServer() as unknown as {
      _requestHandlers: Map<string, (req: unknown) => Promise<unknown>>
    }
    const callHandler = server._requestHandlers.get('tools/call')!
    const result = (await callHandler({
      method: 'tools/call',
      params: { name: 'DOES_NOT_EXIST', arguments: {} },
    })) as { isError: boolean }
    expect(result.isError).toBe(true)
  })
})
