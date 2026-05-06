import { SetMetadata } from '@nestjs/common'

export const MCP_TOOL_KEY = 'mcp_tool'

export type McpToolMetadata = {
  description: string
}

export const McpTool = ({ description }: { description: string }) => {
  if (!description || !description.trim()) {
    throw new Error(
      '@McpTool: description is required and must be non-empty. ' +
        'The description is what the agent reads to decide whether to call this tool.',
    )
  }
  return SetMetadata(MCP_TOOL_KEY, { description } as McpToolMetadata)
}
