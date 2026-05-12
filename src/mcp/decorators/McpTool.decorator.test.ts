/* eslint-disable @typescript-eslint/no-empty-function */
// Test fixtures define decorated controller stubs whose method bodies don't matter.
import { describe, expect, it } from 'vitest'
import { Reflector } from '@nestjs/core'
import { McpTool, MCP_TOOL_KEY, McpToolMetadata } from './McpTool.decorator'

describe('McpTool decorator', () => {
  it('attaches metadata under MCP_TOOL_KEY', () => {
    class Example {
      @McpTool({
        description: "Update fields on the calling user's active campaign.",
      })
      handler() {}
    }

    const reflector = new Reflector()
    const meta = reflector.get<McpToolMetadata>(
      MCP_TOOL_KEY,
      Example.prototype.handler,
    )
    expect(meta).toEqual({
      description: "Update fields on the calling user's active campaign.",
    })
  })

  it('rejects empty description at runtime', () => {
    expect(() => McpTool({ description: '' })).toThrow(/description/i)
    expect(() => McpTool({ description: '   ' })).toThrow(/description/i)
  })
})
