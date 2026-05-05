import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { McpRegistryService } from './services/mcpRegistry.service'
import { McpServerService } from './services/mcpServer.service'
import { AgentMcpController } from './agentMcp.controller'
import { AgentActorGuard } from './guards/AgentActor.guard'

@Module({
  imports: [DiscoveryModule],
  controllers: [AgentMcpController],
  providers: [McpRegistryService, McpServerService, AgentActorGuard],
  exports: [McpRegistryService],
})
export class AgentMcpModule {}
