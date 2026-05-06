import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { McpRegistryService } from './services/mcpRegistry.service'
import { McpServerService } from './services/mcpServer.service'
import { AgentMcpController } from './agentMcp.controller'
import { AgentActorGuard } from './guards/AgentActor.guard'
import { AgentActorTokenController } from './agentActorToken.controller'
import { AgentActorTokenService } from './services/agentActorToken.service'

@Module({
  imports: [DiscoveryModule, ClerkModule],
  controllers: [AgentMcpController, AgentActorTokenController],
  providers: [
    McpRegistryService,
    McpServerService,
    AgentActorGuard,
    AgentActorTokenService,
  ],
  exports: [McpRegistryService],
})
export class AgentMcpModule {}
