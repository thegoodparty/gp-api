import { z } from 'zod'

export const getConversationSchema = z.object({
  conversationId: z.string(),
  messages: z.array(
    z.object({
      id: z.string(),
      role: z.enum(['user', 'assistant', 'system', 'tool']),
      content: z.string(),
      createdAt: z.date(),
    }),
  ),
})

export type GetConversationResponse = z.infer<typeof getConversationSchema>
