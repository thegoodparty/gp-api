import { z } from 'zod'
import { BriefingSchema } from '@/chats/briefing-chats/types/briefing.schema'
import type { Artifact, ArtifactsProvider } from '@/llm/tools/getArtifacts.tool'

type ParsedBriefing = z.infer<typeof BriefingSchema>

const safeParseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return undefined
  }
}

const parseArtifactInput = (
  input: string | ParsedBriefing | null,
): ParsedBriefing | null => {
  if (input === null) return null
  if (typeof input !== 'string') return input
  const raw = safeParseJson(input)
  if (raw === undefined) return null
  const parsed = BriefingSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

const isHttpsUrl = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

const sourceArtifact = (
  briefingId: string,
  meeting: ParsedBriefing['meeting'],
): Artifact | null => {
  if (meeting.sourceUrl === null) return null
  if (!isHttpsUrl(meeting.sourceUrl)) return null
  const sourceType = meeting.sourceType || 'agenda'
  return {
    id: `${briefingId}:source`,
    title: meeting.title || 'Source agenda',
    kind: 'document',
    snippet: `Source ${sourceType} for the ${meeting.date} meeting.`,
    url: meeting.sourceUrl,
  }
}

const issueArtifacts = (
  briefingId: string,
  issue: ParsedBriefing['priorityIssues'][number],
): Artifact[] => {
  const docs = issue.detail?.supportingDocuments
  if (!docs || docs.length === 0) return []
  const out: Artifact[] = []
  docs.forEach((doc, docIndex) => {
    if (!isHttpsUrl(doc.url)) return
    out.push({
      id: `${briefingId}:priority-${issue.number}:${docIndex}`,
      title: doc.name,
      kind: 'link',
      snippet:
        `Supporting document for "${issue.agendaItemTitle}"` +
        ` (${issue.category}).`,
      url: doc.url,
    })
  })
  return out
}

export class BriefingArtifactsProvider implements ArtifactsProvider {
  private readonly parsed: ParsedBriefing | null

  constructor(
    input: string | ParsedBriefing | null,
    private readonly briefingId: string,
  ) {
    this.parsed = parseArtifactInput(input)
  }

  list(): Promise<Artifact[]> {
    if (this.parsed === null) return Promise.resolve([])
    const briefing = this.parsed

    const out: Artifact[] = []
    const source = sourceArtifact(this.briefingId, briefing.meeting)
    if (source) out.push(source)

    const sortedIssues = [...briefing.priorityIssues].sort(
      (a, b) => a.number - b.number,
    )
    for (const issue of sortedIssues) {
      out.push(...issueArtifacts(this.briefingId, issue))
    }
    return Promise.resolve(out)
  }
}
