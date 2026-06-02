import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

// Bound the user message: it flows straight into the LLM prompt, so an
// unbounded body is a cost/DoS and prompt-injection amplifier. 8k chars is
// comfortably above any legitimate chat turn.
//
// Cross-field validation runs at the ZodValidationPipe (before the controller
// writes the SSE 200 header), so invalid combinations are rejected as 400s
// instead of surfacing as generic in-stream `internal` errors.
export class StreamAiChatSchema extends createZodDto(
  z
    .object({
      message: z.string().max(8000).optional(),
      threadId: z.string().optional(),
      initial: z.boolean().optional().default(false),
      regenerate: z.boolean().optional().default(false),
    })
    .superRefine((val, ctx) => {
      if (!val.threadId && !val.message) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'message is required when starting a new thread',
          path: ['message'],
        })
      }
      if (val.regenerate && !val.threadId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'threadId is required when regenerate is true',
          path: ['threadId'],
        })
      }
      // regenerate replays the last user turn from history; a caller-supplied
      // message would be silently discarded by the service, so reject it up
      // front rather than re-ask the wrong question without warning.
      if (val.regenerate && val.message) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'message must not be provided when regenerate is true',
          path: ['message'],
        })
      }
      if (val.threadId && !val.regenerate && !val.message) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'message is required when continuing a thread',
          path: ['message'],
        })
      }
    }),
) {}
