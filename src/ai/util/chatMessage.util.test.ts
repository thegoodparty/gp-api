import { describe, expect, it } from 'vitest'
import {
  isChatCompletionMessage,
  toChatCompletionMessage,
} from './chatMessage.util'

describe('toChatCompletionMessage', () => {
  it('returns a system message for role: system', () => {
    expect(toChatCompletionMessage({ role: 'system', content: 'a' })).toEqual({
      role: 'system',
      content: 'a',
    })
  })

  it('returns a user message for role: user', () => {
    expect(toChatCompletionMessage({ role: 'user', content: 'b' })).toEqual({
      role: 'user',
      content: 'b',
    })
  })

  it('returns an assistant message for role: assistant', () => {
    expect(
      toChatCompletionMessage({ role: 'assistant', content: 'c' }),
    ).toEqual({ role: 'assistant', content: 'c' })
  })

  it('returns undefined for an unknown role', () => {
    expect(toChatCompletionMessage({ role: 'banana', content: 'd' })).toBe(
      undefined,
    )
  })

  it('returns undefined when role is missing', () => {
    expect(toChatCompletionMessage({ content: 'e' })).toBe(undefined)
  })

  it('returns undefined when role is not a string', () => {
    expect(toChatCompletionMessage({ role: 42, content: 'f' })).toBe(undefined)
  })

  it('returns undefined when content is not a string', () => {
    expect(toChatCompletionMessage({ role: 'user', content: 7 })).toBe(
      undefined,
    )
  })

  it('accepts an empty string content', () => {
    expect(toChatCompletionMessage({ role: 'user', content: '' })).toEqual({
      role: 'user',
      content: '',
    })
  })
})

describe('isChatCompletionMessage', () => {
  it('returns true for a defined message', () => {
    expect(isChatCompletionMessage({ role: 'user', content: 'hello' })).toBe(
      true,
    )
  })

  it('returns false for undefined', () => {
    expect(isChatCompletionMessage(undefined)).toBe(false)
  })

  it('narrows out undefined when used as a filter predicate', () => {
    const items: Array<{ role: string; content: string } | undefined> = [
      { role: 'user', content: 'a' },
      undefined,
      { role: 'assistant', content: 'b' },
    ]
    const mapped = items
      .map((m) => (m ? toChatCompletionMessage(m) : undefined))
      .filter(isChatCompletionMessage)
    expect(mapped).toHaveLength(2)
  })
})
