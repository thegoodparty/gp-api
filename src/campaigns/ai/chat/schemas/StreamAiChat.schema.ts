import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Bound the user message: it flows straight into the LLM prompt, so an
// unbounded body is a cost/DoS and prompt-injection amplifier. 8k chars is
// comfortably above any legitimate chat turn.
export class StreamAiChatSchema extends createZodDto(
  z.object({
    message: z.string().max(8000).optional(),
    threadId: z.string().optional(),
    initial: z.boolean().optional().default(false),
    regenerate: z.boolean().optional().default(false),
  }),
) {}
