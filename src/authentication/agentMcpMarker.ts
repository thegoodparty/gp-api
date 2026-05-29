import { Global, Injectable, Module } from '@nestjs/common'
import { randomBytes } from 'node:crypto'

export const MCP_INTERNAL_MARKER_HEADER = 'x-mcp-internal-marker'

@Injectable()
export class AgentMcpMarker {
  // Per-process secret; never leaves the process, so external callers cannot
  // forge an "internal MCP sub-request". Regenerated each boot.
  readonly token = randomBytes(32).toString('hex')

  matches(headerValue: string | string[] | undefined): boolean {
    const v = Array.isArray(headerValue) ? headerValue[0] : headerValue
    return typeof v === 'string' && v.length > 0 && v === this.token
  }
}

@Global()
@Module({ providers: [AgentMcpMarker], exports: [AgentMcpMarker] })
export class AgentMcpMarkerModule {}
