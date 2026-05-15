import { z } from 'zod'
import type { LlmStreamTool } from '@/llm/services/llm.service'

export interface Note {
  id: string
  body: string
  jsonPath: string | null
  highlightedText: string | null
  createdAt: string
}

export interface GetMyNotesInput {
  topic?: string
}

export type GetMyNotesOutput = Note[]

export interface NotesProvider {
  list: () => Promise<Note[]>
}

const getMyNotesInputSchema = z.object({
  topic: z.string().optional(),
})

const matchesTopic = (note: Note, topic: string): boolean => {
  const needle = topic.toLowerCase()
  if (note.body.toLowerCase().includes(needle)) return true
  if (note.highlightedText?.toLowerCase().includes(needle)) return true
  return false
}

export const buildGetMyNotesTool = (deps: {
  provider: NotesProvider
}): LlmStreamTool<GetMyNotesInput, GetMyNotesOutput> => ({
  description:
    'Retrieve the user\'s own notes on this briefing — short annotations the user wrote against specific passages. Use this when the question references something the user might have personally flagged or noted (e.g., "what did I think about", "remind me why I noted"). Each note carries the body the user wrote and the briefing text they highlighted.',
  inputSchema: getMyNotesInputSchema,
  execute: async ({ topic }) => {
    const all = await deps.provider.list()
    if (!topic) return all
    return all.filter((n) => matchesTopic(n, topic))
  },
})

export class InMemoryNotesProvider implements NotesProvider {
  constructor(private readonly notes: Note[]) {}

  list(): Promise<Note[]> {
    return Promise.resolve(this.notes)
  }
}
