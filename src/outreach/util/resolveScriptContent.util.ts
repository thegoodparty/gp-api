import sanitizeHtml from 'sanitize-html'

type AiContent = Record<string, { content?: string } | undefined>

/**
 * Resolves script content from aiContent if the script is a key,
 * otherwise returns the script as-is.
 */
export function resolveScriptContent(
  script: string,
  aiContent: AiContent,
): string {
  const aiGeneratedScriptContent = aiContent[script]?.content
  return aiGeneratedScriptContent
    ? sanitizeHtml(aiGeneratedScriptContent, {
        allowedTags: [],
        allowedAttributes: {},
      })
    : script
}

