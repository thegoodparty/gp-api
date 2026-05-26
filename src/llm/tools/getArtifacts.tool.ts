import { z } from 'zod'
import type { LlmStreamTool } from '@/llm/services/llm.service'

export type ArtifactKind = 'document' | 'link' | 'note'

export interface Artifact {
  id: string
  title: string
  kind: ArtifactKind
  snippet: string
  url?: string
}

export interface GetArtifactsInput {
  topic?: string
}

export type GetArtifactsOutput = Artifact[]

export interface ArtifactsProvider {
  list: () => Promise<Artifact[]>
}

const getArtifactsInputSchema = z.object({
  topic: z.string().optional(),
})

const matchesTopic = (artifact: Artifact, topic: string): boolean => {
  const needle = topic.toLowerCase()
  return (
    artifact.title.toLowerCase().includes(needle) ||
    artifact.snippet.toLowerCase().includes(needle)
  )
}

export const buildGetArtifactsTool = (deps: {
  provider: ArtifactsProvider
}): LlmStreamTool<GetArtifactsInput, GetArtifactsOutput> => ({
  description:
    "Retrieve artifacts attached to the current briefing or context — documents, prior decisions, related research. Use this when the user asks 'what do we have on this' or 'show me the source material'.",
  inputSchema: getArtifactsInputSchema,
  execute: async ({ topic }) => {
    const all = await deps.provider.list()
    if (!topic) return all
    return all.filter((a) => matchesTopic(a, topic))
  },
})

export class InMemoryArtifactsProvider implements ArtifactsProvider {
  constructor(private readonly artifacts: Artifact[]) {}

  list(): Promise<Artifact[]> {
    return Promise.resolve(this.artifacts)
  }
}
