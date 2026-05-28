import { z } from 'zod'
import type { LlmStreamTool } from '@/llm/services/llm.service'

export interface Note {
  id: string
  body: string
  jsonPath: string | null
  highlightedText: string | null
  createdAt: string
}

export type GetMyNotesInput = Record<string, never>

export type GetMyNotesOutput = Note[]

export interface NotesProvider {
  list: () => Promise<Note[]>
}

const getMyNotesInputSchema = z.object({})

export const buildGetMyNotesTool = (deps: {
  provider: NotesProvider
}): LlmStreamTool<GetMyNotesInput, GetMyNotesOutput> => ({
  description:
    'Retrieve the user\'s own notes on this briefing — short annotations the user wrote against specific passages. Use this when the question references something the user might have personally flagged or noted (e.g., "what did I think about", "remind me why I noted"). Each note carries the body the user wrote and the briefing text they highlighted. Returns every note for the briefing; you do the filtering yourself.',
  inputSchema: getMyNotesInputSchema,
  execute: async () => deps.provider.list(),
})

export class InMemoryNotesProvider implements NotesProvider {
  constructor(private readonly notes: Note[]) {}

  list(): Promise<Note[]> {
    return Promise.resolve(this.notes)
  }
}
