/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
// NestJS DiscoveryService surfaces controller wrappers with `instance` and `metatype` typed as `any`,
// and the Reflect API by definition returns `any`. This file works at the metadata layer; explicit
// casts at every site would be noise. Behavior is covered by mcpRegistry.service.test.ts.
import { Injectable, OnModuleInit, RequestMethod } from '@nestjs/common'
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { MCP_TOOL_KEY, McpToolMetadata } from '../decorators/McpTool.decorator'
import {
  reflectInputDeclarations,
  reflectOutputSchema,
} from '../util/schemaReflect.util'
import { deriveToolName } from '../util/toolName.util'
import { RegisteredMcpTool } from '../agentMcp.types'

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

@Injectable()
export class McpRegistryService implements OnModuleInit {
  private tools: RegisteredMcpTool[] = []
  private toolsByName = new Map<string, RegisteredMcpTool>()

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly metadataScanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
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
    this.tools = collected
    this.toolsByName = byName
  }

  getAll(): readonly RegisteredMcpTool[] {
    return this.tools
  }

  findByToolName(name: string): RegisteredMcpTool | undefined {
    return this.toolsByName.get(name)
  }
}
