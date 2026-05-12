import { Controller, All, Req, Res } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { PinoLogger } from 'nestjs-pino'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpServerService } from './services/mcpServer.service'

@Controller('mcp')
export class McpController {
  constructor(
    private readonly mcp: McpServerService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(McpController.name)
  }

  @All()
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const server = this.mcp.createServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    try {
      await transport.handleRequest(req.raw, reply.raw, req.body)
    } catch (err) {
      // `@Res()` puts Fastify into manual reply mode, so Nest's exception filter
      // won't finalize this response. If handleRequest throws mid-write the SDK
      // may have already sent headers — only finalize when we still can.
      this.logger.error({ err }, 'MCP transport.handleRequest threw')
      if (!reply.raw.headersSent) {
        reply.raw.writeHead(500, { 'content-type': 'application/json' })
        reply.raw.end(JSON.stringify({ error: 'Internal Server Error' }))
      }
    }
  }
}
