import { Module } from '@nestjs/common'
import { DiscoveryModule } from '@nestjs/core'
import { McpServerService } from './services/mcpServer.service'
import { McpController } from './mcp.controller'

@Module({
  imports: [DiscoveryModule],
  providers: [McpServerService],
  exports: [McpServerService],
  controllers: [McpController],
})
export class McpModule {}
