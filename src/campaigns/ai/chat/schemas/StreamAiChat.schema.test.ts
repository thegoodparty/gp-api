import { describe, expect, it } from 'vitest'
import { StreamAiChatSchema } from './StreamAiChat.schema'

describe('StreamAiChatSchema', () => {
  const schema = StreamAiChatSchema.schema

  it('accepts a new-thread message', () => {
    expect(schema.safeParse({ message: 'hi' }).success).toBe(true)
  })

  it('accepts a follow-up message on an existing thread', () => {
    expect(schema.safeParse({ threadId: 't1', message: 'hi' }).success).toBe(
      true,
    )
  })

  it('accepts a regenerate with a threadId', () => {
    expect(schema.safeParse({ threadId: 't1', regenerate: true }).success).toBe(
      true,
    )
  })

  it('rejects an empty body (no threadId, no message)', () => {
    expect(schema.safeParse({}).success).toBe(false)
  })

  it('rejects regenerate without a threadId', () => {
    expect(schema.safeParse({ regenerate: true }).success).toBe(false)
  })

  it('rejects continuing a thread without a message', () => {
    expect(schema.safeParse({ threadId: 't1' }).success).toBe(false)
  })

  it('rejects an over-long message', () => {
    expect(schema.safeParse({ message: 'a'.repeat(8001) }).success).toBe(false)
  })

  it('rejects regenerate with a caller-supplied message', () => {
    expect(
      schema.safeParse({ threadId: 't1', regenerate: true, message: 'hi' })
        .success,
    ).toBe(false)
  })
})
