/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-type-assertion */
// zod-to-json-schema returns a JSONSchema-shaped object that the MCP SDK accepts as
// Tool['inputSchema'], but its return type is broader than the SDK's tighter declaration.
// The fastify adapter is loosely typed via HttpAdapterHost, so member access on the
// underlying instance triggers unsafe-* lints. The casts here are deliberate adapters
// to known runtime shapes (fastify's inject API, MCP SDK's Tool inputSchema). Behavior
// is covered by mcpServer.service.test.ts.
import { Injectable, Logger } from '@nestjs/common'
import { HttpAdapterHost } from '@nestjs/core'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { McpRegistryService } from './mcpRegistry.service'
import { RegisteredMcpTool } from '../agentMcp.types'
import { buildCombinedInputSchema } from '../util/inputSchema.util'

type FastifyInjectResponse = {
  statusCode: number
  body: string
  headers: Record<string, string>
}

type FastifyAdapter = {
  getInstance: () => {
    inject: (opts: {
      method: string
      url: string
      headers?: Record<string, string>
      payload?: unknown
    }) => Promise<FastifyInjectResponse>
  }
}

@Injectable()
export class McpServerService {
  private readonly logger = new Logger(McpServerService.name)
  private readonly server: Server

  constructor(
    private readonly registry: McpRegistryService,
    private readonly httpAdapterHost: HttpAdapterHost,
  ) {
    this.server = new Server(
      { name: 'gp-api', version: '1.0.0' },
      { capabilities: { tools: {} } },
    )

    this.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.registry.getAll().map((t) => this.toMcpTool(t)),
    }))

    this.server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
      const tool = this.registry.findByToolName(req.params.name)
      if (!tool) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
        }
      }

      const args = (req.params.arguments ?? {}) as {
        body?: unknown
        query?: Record<string, string>
        params?: Record<string, string>
      }

      const url = this.buildUrl(tool.path, args.params, args.query)
      const adapter = this.httpAdapterHost
        .httpAdapter as unknown as FastifyAdapter
      const fastify = adapter.getInstance()

      // Forward the originating HTTP Authorization header so the inner injected
      // request re-runs through the global SessionGuard as the same user. The
      // MCP SDK exposes the originating headers via `extra.requestInfo` since 1.x.
      const forwardHeaders: Record<string, string> = {}
      const rawAuth = extra?.requestInfo?.headers?.authorization
      const authValue = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth
      if (authValue) forwardHeaders.authorization = authValue

      const response = await fastify.inject({
        method: tool.method,
        url,
        headers: forwardHeaders,
        payload: args.body,
      })

      return {
        content: [{ type: 'text', text: response.body }],
        isError: response.statusCode >= 400,
      }
    })
  }

  getServer(): Server {
    return this.server
  }

  private toMcpTool(t: RegisteredMcpTool): Tool {
    const combined = buildCombinedInputSchema(t.inputDeclarations)
    const inputSchema = combined
      ? (zodToJsonSchema(combined) as unknown as Tool['inputSchema'])
      : ({ type: 'object', properties: {} } as Tool['inputSchema'])

    return {
      name: t.toolName,
      description: t.description,
      inputSchema,
    }
  }

  private buildUrl(
    path: string,
    params?: Record<string, string>,
    query?: Record<string, string>,
  ): string {
    let url = path
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        url = url.replace(`:${k}`, encodeURIComponent(v))
      }
    }
    if (query && Object.keys(query).length > 0) {
      const qs = new URLSearchParams(query).toString()
      url += `?${qs}`
    }
    return url
  }
}
