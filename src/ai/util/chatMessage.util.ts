import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions'

const VALID_ROLES = new Set(['system', 'user', 'assistant'])

/**
 * Convert a stored chat-message-shaped record into an OpenAI
 * `ChatCompletionMessageParam`. Returns `undefined` for any record
 * whose role is not one of `'system' | 'user' | 'assistant'`.
 *
 * The input is intentionally loose because callers receive messages
 * from Prisma JSON columns or zod-validated client payloads that do
 * not constrain `role` at the type level.
 */
export const toChatCompletionMessage = (m: {
  role?: unknown
  content?: unknown
}): ChatCompletionMessageParam | undefined => {
  const role = typeof m.role === 'string' ? m.role : undefined
  const content = typeof m.content === 'string' ? m.content : undefined
  if (!role || content === undefined || !VALID_ROLES.has(role)) {
    return undefined
  }
  switch (role) {
    case 'system':
      return { role: 'system', content }
    case 'user':
      return { role: 'user', content }
    case 'assistant':
      return { role: 'assistant', content }
    default:
      return undefined
  }
}

export const isChatCompletionMessage = (
  m: ChatCompletionMessageParam | undefined,
): m is ChatCompletionMessageParam => m !== undefined
