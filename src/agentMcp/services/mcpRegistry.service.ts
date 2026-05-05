import { Injectable, OnModuleInit, RequestMethod } from '@nestjs/common'
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core'
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants'
import { MCP_TOOL_KEY, McpToolMetadata } from '../decorators/McpTool.decorator'
import {
  reflectInputSchema,
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

        if (httpMethodNum === undefined) continue

        const method = HTTP_METHOD_NAME[httpMethodNum] ?? 'UNKNOWN'
        const path = joinPath(controllerPath, methodPath)
        const toolName = deriveToolName(method, path)

        collected.push({
          toolName,
          description: meta.description,
          method,
          path,
          inputSchema: reflectInputSchema(proto, methodName),
          outputSchema: reflectOutputSchema(handler),
          controllerClassName: metatype.name,
          handlerName: methodName,
        })
      }
    }

    this.tools = collected
  }

  getAll(): readonly RegisteredMcpTool[] {
    return this.tools
  }

  findByToolName(name: string): RegisteredMcpTool | undefined {
    return this.tools.find((t) => t.toolName === name)
  }
}
