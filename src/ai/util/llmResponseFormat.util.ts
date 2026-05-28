import { ToolCall } from '@/llm/services/llm.service'

const HTML_FENCE_REGEX = /```html([\s\S]*?)```/
const FUNCTION_TAG_REGEX = /<function=(\w+)>([\s\S]*?)<\/function>/

/**
 * Post-processing applied to LLM content for HTML rendering paths
 * (`aiContent`, `aiChat`). Strips ```html fences and converts raw
 * newlines into `<br/><br/>` so the response renders cleanly in the
 * candidate UI without further formatting.
 */
export const formatHtmlLlmResponse = (content: string): string => {
  const stripped = stripHtmlFences(content)
  return stripped.replace(/\n/g, '<br/><br/>')
}

/**
 * Extracts the arguments string from the first tool call, falling back
 * to the message content and applying the legacy `<function=...>` tag
 * fallback that some non-OpenAI models emit instead of tool_calls.
 */
export const extractToolCallContent = (result: {
  content: string
  toolCalls?: ToolCall[]
}): string => {
  const toolCallArgs = result.toolCalls?.[0]?.function?.arguments
  if (toolCallArgs) {
    return toolCallArgs
  }

  const content = result.content.trim()
  const match = content.match(FUNCTION_TAG_REGEX)
  if (!match) {
    return content
  }

  const argsString = match[2]
  try {
    JSON.parse(argsString)
    return argsString
  } catch {
    return content
  }
}

const stripHtmlFences = (content: string): string => {
  if (!content.includes('```html')) return content
  const match = content.match(HTML_FENCE_REGEX)
  return match ? match[1] : content
}
