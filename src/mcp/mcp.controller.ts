import { Controller, All, Req, Res } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpServerService } from './services/mcpServer.service'

@Controller('mcp')
export class McpController {
  constructor(private readonly mcp: McpServerService) {}

  @All()
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const server = this.mcp.createServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await server.connect(transport)
    await transport.handleRequest(req.raw, reply.raw, req.body)
  }
}
