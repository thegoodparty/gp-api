import { Controller, All, Req, Res, UseGuards } from '@nestjs/common'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { McpServerService } from './services/mcpServer.service'
import { AgentActorGuard } from './guards/AgentActor.guard'

@Controller('agent/mcp')
@UseGuards(AgentActorGuard)
export class AgentMcpController {
  constructor(private readonly mcp: McpServerService) {}

  @All()
  async handle(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    await this.mcp.getServer().connect(transport)
    await transport.handleRequest(req.raw, reply.raw, req.body)
  }
}
