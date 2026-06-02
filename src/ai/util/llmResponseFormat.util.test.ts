import { describe, expect, it } from 'vitest'
import {
  extractToolCallContent,
  formatHtmlLlmResponse,
} from './llmResponseFormat.util'

const PLAIN_TEXT = 'plain text'
const ARGS_X1 = '{"x":1}'

describe('formatHtmlLlmResponse', () => {
  it('replaces single newlines with double br tags', () => {
    expect(formatHtmlLlmResponse('hello\nworld')).toBe('hello<br/><br/>world')
  })

  it('replaces multiple newlines individually', () => {
    expect(formatHtmlLlmResponse('a\nb\nc')).toBe('a<br/><br/>b<br/><br/>c')
  })

  it('passes through content without newlines unchanged', () => {
    expect(formatHtmlLlmResponse(PLAIN_TEXT)).toBe(PLAIN_TEXT)
  })

  it('strips a fenced ```html block and returns its inner content', () => {
    const fenced = '```html\n<p>hi</p>\n```'
    const result = formatHtmlLlmResponse(fenced)
    expect(result).toBe('<br/><br/><p>hi</p><br/><br/>')
  })

  it('returns content as-is when no html fence is present', () => {
    expect(formatHtmlLlmResponse('<p>hi</p>')).toBe('<p>hi</p>')
  })

  it('handles empty content', () => {
    expect(formatHtmlLlmResponse('')).toBe('')
  })
})

describe('extractToolCallContent', () => {
  it('returns the first tool call arguments when present', () => {
    const result = extractToolCallContent({
      content: 'fallback ignored',
      toolCalls: [
        {
          id: 't1',
          type: 'function',
          function: { name: 'doThing', arguments: ARGS_X1 },
        },
      ],
    })
    expect(result).toBe(ARGS_X1)
  })

  it('falls back to content when toolCalls is empty', () => {
    const result = extractToolCallContent({
      content: PLAIN_TEXT,
      toolCalls: [],
    })
    expect(result).toBe(PLAIN_TEXT)
  })

  it('falls back to content when toolCalls is undefined', () => {
    const result = extractToolCallContent({ content: PLAIN_TEXT })
    expect(result).toBe(PLAIN_TEXT)
  })

  it('extracts arguments from a single-line <function=...> tag', () => {
    const result = extractToolCallContent({
      content: `<function=doThing>${ARGS_X1}</function>`,
    })
    expect(result).toBe(ARGS_X1)
  })

  it('extracts arguments from a multi-line <function=...> tag', () => {
    const args = '{\n  "outlets": [\n    {"name": "WSJ"}\n  ]\n}'
    const content = `<function=returnOutlets>${args}</function>`
    expect(extractToolCallContent({ content })).toBe(args)
  })

  it('returns the full trimmed content when tag args are invalid JSON', () => {
    const content = '<function=doThing>not json</function>'
    expect(extractToolCallContent({ content })).toBe(content)
  })

  it('returns content when no <function=...> tag is present', () => {
    expect(extractToolCallContent({ content: 'just words' })).toBe('just words')
  })

  it('returns content when the tag is malformed (missing closing)', () => {
    const content = `<function=doThing>${ARGS_X1}`
    expect(extractToolCallContent({ content })).toBe(content)
  })

  it('trims surrounding whitespace before regex match', () => {
    const content = `   <function=doThing>${ARGS_X1}</function>   `
    expect(extractToolCallContent({ content })).toBe(ARGS_X1)
  })
})
