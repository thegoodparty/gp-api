import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { ClerkModule } from '@/vendors/clerk/clerk.module'
import { McpServerService } from './services/mcpServer.service'
import { McpController } from './mcp.controller'
import { AgentActorGuard } from './guards/AgentActor.guard'
import { AgentActorTokenController } from './agentActorToken.controller'
import { AgentActorTokenService } from './services/agentActorToken.service'

@Module({
  imports: [DiscoveryModule, ClerkModule],
  providers: [McpServerService, AgentActorGuard, AgentActorTokenService],
  exports: [McpServerService],
  controllers: [McpController, AgentActorTokenController],
})
export class McpModule {}
