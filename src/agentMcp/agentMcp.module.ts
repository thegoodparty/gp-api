import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { McpRegistryService } from './services/mcpRegistry.service'

@Module({
  imports: [DiscoveryModule],
  providers: [McpRegistryService],
  exports: [McpRegistryService],
})
export class AgentMcpModule {}
