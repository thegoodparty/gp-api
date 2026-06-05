// Shared prompt-injection guard. Strips chat-template / role delimiters that an
// untrusted source (user message, candidate-entered campaign details, briefing
// content) could use to break out of its data section and impersonate the
// system/user/assistant. Used by both the briefing and campaign assistants.

const DELIMITER_REMOVED = '[delimiter-removed]'

const DELIMITER_PATTERNS: RegExp[] = [
  /<\/?briefing_content\s*>?/gi,
  /<\/?briefing\s*>?/gi,
  /<\/?user_data\s*>?/gi,
  /<\/?system\s*>?/gi,
  /<\/?instructions\s*>?/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /<\|system\|>/gi,
  /<\|user\|>/gi,
  /<\|assistant\|>/gi,
]

export const sanitizeUntrustedContent = (s: string): string =>
  DELIMITER_PATTERNS.reduce((acc, re) => acc.replace(re, DELIMITER_REMOVED), s)
