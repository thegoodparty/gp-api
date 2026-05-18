import {
  type AssistantModelMessage,
  type ModelMessage,
  type SystemModelMessage,
  type TextPart,
  type ToolCallPart,
  type ToolModelMessage,
  type ToolResultPart,
  type UserModelMessage,
} from 'ai'
import {
  ChatCompletionAssistantMessageParam,
  ChatCompletionContentPart,
  ChatCompletionContentPartText,
  ChatCompletionMessageParam,
  ChatCompletionToolMessageParam,
} from 'openai/resources/chat/completions'

export const toModelMessages = (
  messages: ChatCompletionMessageParam[],
): ModelMessage[] => {
  const toolCallNames = new Map<string, string>()
  return messages.map((m) => {
    if (m.role === 'assistant' && m.tool_calls) {
      for (const tc of m.tool_calls) {
        toolCallNames.set(tc.id, tc.function.name)
      }
    }
    return convertMessage(m, toolCallNames)
  })
}

const convertMessage = (
  m: ChatCompletionMessageParam,
  toolCallNames: Map<string, string>,
): ModelMessage => {
  switch (m.role) {
    case 'system':
      return convertSystemMessage(m)
    case 'user':
      return convertUserMessage(m)
    case 'assistant':
      return convertAssistantMessage(m)
    case 'tool':
      return convertToolMessage(m, toolCallNames)
    case 'function':
    case 'developer':
      throw new Error(
        `Unsupported message role for AI SDK conversion: ${m.role}`,
      )
    default: {
      const exhaustiveCheck: never = m
      return exhaustiveCheck
    }
  }
}

const convertSystemMessage = (m: {
  role: 'system'
  content: string | Array<ChatCompletionContentPartText>
}): SystemModelMessage => {
  const content =
    typeof m.content === 'string'
      ? m.content
      : m.content.map((p) => p.text).join('')
  return { role: 'system', content }
}

const convertUserMessage = (m: {
  role: 'user'
  content: string | Array<ChatCompletionContentPart>
}): UserModelMessage => {
  if (typeof m.content === 'string') {
    return { role: 'user', content: m.content }
  }
  const parts: TextPart[] = []
  for (const part of m.content) {
    switch (part.type) {
      case 'text':
        parts.push({ type: 'text', text: part.text })
        break
      case 'image_url':
      case 'input_audio':
      case 'file':
        break
      default: {
        const exhaustiveCheck: never = part
        void exhaustiveCheck
        break
      }
    }
  }
  return { role: 'user', content: parts }
}

const convertAssistantMessage = (
  m: ChatCompletionAssistantMessageParam,
): AssistantModelMessage => {
  const textContent = extractAssistantText(m.content)

  const toolCallParts: ToolCallPart[] = (m.tool_calls ?? []).map((tc) => ({
    type: 'tool-call',
    toolCallId: tc.id,
    toolName: tc.function.name,
    input: safeParseJson(tc.function.arguments),
  }))

  if (toolCallParts.length === 0) {
    return { role: 'assistant', content: textContent }
  }

  const parts: Array<TextPart | ToolCallPart> = []
  if (textContent.length > 0) {
    parts.push({ type: 'text', text: textContent })
  }
  parts.push(...toolCallParts)
  return { role: 'assistant', content: parts }
}

const extractAssistantText = (
  content: ChatCompletionAssistantMessageParam['content'],
): string => {
  if (typeof content === 'string') {
    return content
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        switch (part.type) {
          case 'text':
            return part.text
          case 'refusal':
            return ''
          default:
            return ''
        }
      })
      .join('')
  }
  return ''
}

const convertToolMessage = (
  m: ChatCompletionToolMessageParam,
  toolCallNames: Map<string, string>,
): ToolModelMessage => {
  const text =
    typeof m.content === 'string'
      ? m.content
      : m.content.map((p) => p.text).join('')

  const part: ToolResultPart = {
    type: 'tool-result',
    toolCallId: m.tool_call_id,
    toolName: toolCallNames.get(m.tool_call_id) ?? '',
    output: { type: 'text', value: text },
  }

  return {
    role: 'tool',
    content: [part],
  }
}

const safeParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}
