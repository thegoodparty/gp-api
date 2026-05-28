export const GEMINI_MODEL = {
  FLASH_3_PREVIEW: 'gemini-3-flash-preview',
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
