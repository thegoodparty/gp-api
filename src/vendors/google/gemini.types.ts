export const GEMINI_MODEL = {
  FLASH_3_PREVIEW: 'gemini-3-flash-preview',
  // Stable Flash 3.5 release (confirmed via Generative Language
  // `/v1beta/models` listing 2026-06-01). Preferred for production-ish
  // pipelines where the preview variant's behavior may shift; used by
  // CommunityEventsService.
  FLASH_3_5: 'gemini-3.5-flash',
  PRO_3_PREVIEW: 'gemini-3-pro-preview',
} as const

export type GeminiModel = (typeof GEMINI_MODEL)[keyof typeof GEMINI_MODEL]

export interface GroundingSource {
  title: string
  uri: string
}

export interface SearchResult {
  text: string
  searchQueries: string[]
  sources: GroundingSource[]
}

export interface GenerateOptions {
  model?: GeminiModel
  temperature?: number
  systemInstruction?: string
}
