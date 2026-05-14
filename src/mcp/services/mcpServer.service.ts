/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-type-assertion */
// zod-to-json-schema returns a JSONSchema-shaped object that the MCP SDK accepts as
// Tool['inputSchema'], but its return type is broader than the SDK's tighter declaration.
// The fastify adapter is loosely typed via HttpAdapterHost, so member access on the
// underlying instance triggers unsafe-* lints. NestJS DiscoveryService surfaces controller
// wrappers with `instance` and `metatype` typed as `any`, and the Reflect API by definition
// returns `any`. The casts here are deliberate adapters to known runtime shapes (fastify's
// inject API, MCP SDK's Tool inputSchema, NestJS metadata layer). Behavior is covered by
// mcpServer.service.test.ts.
import { Injectable, RequestMethod } from '@nestjs/common'
import {
  ApplicationConfig,
  DiscoveryService,
  HttpAdapterHost,
  MetadataScanner,
  Reflector,
} from '@nestjs/core'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { PinoLogger } from 'nestjs-pino'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'

import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { MCP_TOOL_KEY, McpToolMetadata } from '../decorators/McpTool.decorator'
import {
  reflectInputDeclarations,
  reflectOutputSchema,
} from '../util/schemaReflect.util'
import { deriveToolName } from '../util/toolName.util'
import { RegisteredMcpTool } from '../mcp.types'
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

const HTTP_METHOD_NAME: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
  [RequestMethod.ALL]: 'ALL',
}

const joinPath = (controllerPath: string, methodPath: string): string => {
  const c = controllerPath.startsWith('/')
    ? controllerPath
    : `/${controllerPath}`
  const m = methodPath.startsWith('/')
    ? methodPath
    : methodPath
      ? `/${methodPath}`
      : ''
  return `${c}${m}`.replace(/\/+/g, '/')
}

const DROPPED_REQUEST_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'content-encoding',
  'transfer-encoding',
  'accept-encoding',
  'expect',
  'te',
  'upgrade',
])

@Injectable()
export class McpServerService {
  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
    private readonly httpAdapterHost: HttpAdapterHost,
    private readonly applicationConfig: ApplicationConfig,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(McpServerService.name)
  }

  createServer(): Server {
    const server = new Server(
      { name: 'gp-api', version: '1.0.0' },
      { capabilities: { tools: {} } },
    )

    server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: this.gatherTools().map((t) => this.toMcpTool(t)),
    }))

    server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
      const tools = this.gatherTools()
      const tool = tools.find((t) => t.toolName === req.params.name)
      if (!tool) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
        }
      }

      // Validate the inbound arguments against the tool's own declared schema —
      // same schema we expose via tools/list. Keeps untrusted callers from
      // smuggling non-strings into URL path params or arbitrary shapes into
      // routes whose Zod DTO would later reject them anyway.
      const inputSchema = buildCombinedInputSchema(tool.inputDeclarations)
      const parsed = inputSchema
        ? inputSchema.safeParse(req.params.arguments ?? {})
        : { success: true as const, data: {} }
      if (!parsed.success) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Invalid arguments: ${parsed.error.message}`,
            },
          ],
        }
      }
      const args = parsed.data as {
        body?: unknown
        query?: Record<string, string>
        params?: Record<string, string>
      }

      const prefix = this.applicationConfig.getGlobalPrefix()
      const url = this.buildUrl(prefix, tool.path, args.params, args.query)
      const adapter = this.httpAdapterHost
        .httpAdapter as unknown as FastifyAdapter
      const fastify = adapter.getInstance()

      // Forward most originating HTTP headers so the inner injected request
      // sees the same auth and context (e.g. authorization for SessionGuard,
      // x-organization-slug for UseCampaign). Drop hop-by-hop and HTTP-framing
      // headers that fastify.inject will set itself. The MCP SDK exposes the
      // originating headers via `extra.requestInfo` since 1.x.
      const inboundHeaders = extra?.requestInfo?.headers ?? {}
      const forwardHeaders: Record<string, string> = {}
      for (const [name, value] of Object.entries(inboundHeaders)) {
        if (DROPPED_REQUEST_HEADERS.has(name.toLowerCase())) continue
        const v = Array.isArray(value) ? value[0] : value
        if (typeof v === 'string') forwardHeaders[name] = v
      }

      const response = await fastify.inject({
        method: tool.method,
        url,
        headers: forwardHeaders,
        payload: args.body,
      })

      if (response.statusCode >= 400) {
        this.logger.warn(
          {
            toolName: tool.toolName,
            method: tool.method,
            statusCode: response.statusCode,
          },
          'MCP tool invocation returned non-2xx',
        )
      }

      return {
        content: [{ type: 'text', text: response.body }],
        isError: response.statusCode >= 400,
      }
    })

    return server
  }

  getTools(): RegisteredMcpTool[] {
    return this.gatherTools()
  }

  private gatherTools(): RegisteredMcpTool[] {
    const controllers = this.discovery.getControllers()
    const collected: RegisteredMcpTool[] = []

    for (const wrapper of controllers) {
      const { instance, metatype } = wrapper
      if (!instance || !metatype) continue

      const controllerPath: string =
        Reflect.getMetadata(PATH_METADATA, metatype) ?? ''

      const proto = Object.getPrototypeOf(instance)
      const methodNames = this.metadataScanner.getAllMethodNames(proto)

      for (const methodName of methodNames) {
        const handler = proto[methodName]
        const meta = this.reflector.get<McpToolMetadata>(MCP_TOOL_KEY, handler)
        if (!meta) continue

        const httpMethodNum: number | undefined = Reflect.getMetadata(
          METHOD_METADATA,
          handler,
        )
        const methodPath: string =
          Reflect.getMetadata(PATH_METADATA, handler) ?? ''

        if (httpMethodNum === undefined) {
          throw new Error(
            `@McpTool applied to ${metatype.name}.${methodName}, which has no HTTP method decorator. ` +
              `@McpTool can only be used on controller route handlers (@Get/@Post/@Put/@Patch/@Delete).`,
          )
        }

        const method = HTTP_METHOD_NAME[httpMethodNum] ?? 'UNKNOWN'
        const path = joinPath(controllerPath, methodPath)
        const toolName = deriveToolName(method, path)

        collected.push({
          toolName,
          description: meta.description,
          method,
          path,
          inputDeclarations: reflectInputDeclarations(proto, methodName, path),
          outputSchema: reflectOutputSchema(handler),
          controllerClassName: metatype.name,
          handlerName: methodName,
        })
      }
    }

    const byName = new Map<string, RegisteredMcpTool>()
    for (const t of collected) {
      if (byName.has(t.toolName)) {
        const existing = byName.get(t.toolName)!
        throw new Error(
          `Duplicate MCP tool name "${t.toolName}" — registered by ${existing.controllerClassName}.${existing.handlerName} and ${t.controllerClassName}.${t.handlerName}`,
        )
      }
      byName.set(t.toolName, t)
    }

    const violations: string[] = []
    for (const t of collected) {
      if (!t.outputSchema) {
        violations.push(`${t.toolName}: missing @ResponseSchema(...)`)
      }
      if (
        t.inputDeclarations.body.declared &&
        !t.inputDeclarations.body.schema
      ) {
        violations.push(
          `${t.toolName}: @Body declared but is not a nestjs-zod createZodDto class`,
        )
      }
      if (
        t.inputDeclarations.query.declared &&
        !t.inputDeclarations.query.schema
      ) {
        violations.push(
          `${t.toolName}: @Query declared but is not a nestjs-zod createZodDto class`,
        )
      }
      if (
        t.inputDeclarations.params.declared &&
        !t.inputDeclarations.params.schema
      ) {
        violations.push(
          `${t.toolName}: @Param or path :placeholder is present but no nestjs-zod createZodDto provides a Zod schema`,
        )
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `Invalid @McpTool configuration:\n  ${violations.join('\n  ')}`,
      )
    }

    this.logger.debug({ toolCount: collected.length }, 'gathered MCP tools')

    return collected
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
    globalPrefix: string,
    path: string,
    params?: Record<string, string>,
    query?: Record<string, string>,
  ): string {
    const cleanPrefix = globalPrefix
      ? `/${globalPrefix.replace(/^\/+|\/+$/g, '')}`
      : ''
    let url = `${cleanPrefix}${path}`
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
