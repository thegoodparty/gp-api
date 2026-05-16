import { describe, expect, it } from 'vitest'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { toModelMessages } from './messageConversion'

describe('toModelMessages — tool message conversion', () => {
  it('uses the toolName from the preceding assistant tool_call', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-abc',
            type: 'function',
            function: { name: 'my_tool', arguments: '{"a":1}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call-abc',
        content: 'result text',
      },
    ]

    const converted = toModelMessages(messages)
    const toolMsg = converted[1]

    expect(toolMsg.role).toBe('tool')
    if (toolMsg.role !== 'tool') return
    const part = toolMsg.content[0]
    expect(part.type).toBe('tool-result')
    if (part.type !== 'tool-result') return
    expect(part.toolName).toBe('my_tool')
    expect(part.toolCallId).toBe('call-abc')
    expect(part.output).toEqual({ type: 'text', value: 'result text' })
  })

  it('threads toolName across multiple assistant tool_calls in the same turn', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-1',
            type: 'function',
            function: { name: 'first_tool', arguments: '{}' },
          },
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'second_tool', arguments: '{}' },
          },
        ],
      },
      { role: 'tool', tool_call_id: 'call-2', content: 'second' },
      { role: 'tool', tool_call_id: 'call-1', content: 'first' },
    ]

    const converted = toModelMessages(messages)
    const second = converted[1]
    const first = converted[2]

    if (second.role !== 'tool' || first.role !== 'tool') {
      throw new Error('expected tool messages')
    }
    const secondPart = second.content[0]
    const firstPart = first.content[0]
    if (secondPart.type !== 'tool-result' || firstPart.type !== 'tool-result') {
      throw new Error('expected tool-result parts')
    }
    expect(secondPart.toolName).toBe('second_tool')
    expect(firstPart.toolName).toBe('first_tool')
  })

  it('falls back to empty toolName when no preceding assistant tool_call matches', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'tool',
        tool_call_id: 'orphan',
        content: 'no parent',
      },
    ]

    const converted = toModelMessages(messages)
    const toolMsg = converted[0]
    if (toolMsg.role !== 'tool') throw new Error('expected tool message')
    const part = toolMsg.content[0]
    if (part.type !== 'tool-result') throw new Error('expected tool-result')
    expect(part.toolName).toBe('')
  })

  it('handles array content on tool messages by joining text parts', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: 'call-x',
            type: 'function',
            function: { name: 'array_tool', arguments: '{}' },
          },
        ],
      },
      {
        role: 'tool',
        tool_call_id: 'call-x',
        content: [
          { type: 'text', text: 'hello ' },
          { type: 'text', text: 'world' },
        ],
      },
    ]

    const converted = toModelMessages(messages)
    const toolMsg = converted[1]
    if (toolMsg.role !== 'tool') throw new Error('expected tool message')
    const part = toolMsg.content[0]
    if (part.type !== 'tool-result') throw new Error('expected tool-result')
    expect(part.toolName).toBe('array_tool')
    expect(part.output).toEqual({ type: 'text', value: 'hello world' })
  })
})

describe('toModelMessages — user content parts', () => {
  it('drops non-text content parts (image_url, input_audio) when converting', () => {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'caption: ' },
          {
            type: 'image_url',
            image_url: { url: 'https://example.com/x.png' },
          },
          { type: 'text', text: 'end' },
        ],
      },
    ]

    const converted = toModelMessages(messages)
    const userMsg = converted[0]
    if (userMsg.role !== 'user') throw new Error('expected user')
    expect(userMsg.content).toEqual([
      { type: 'text', text: 'caption: ' },
      { type: 'text', text: 'end' },
    ])
  })
})
