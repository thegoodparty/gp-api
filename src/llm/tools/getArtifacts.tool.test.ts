import { describe, expect, it } from 'vitest'
import {
  buildGetArtifactsTool,
  InMemoryArtifactsProvider,
  type Artifact,
} from './getArtifacts.tool'

describe('getArtifacts tool', () => {
  it('returns the full set of artifacts when no topic is provided', async () => {
    const artifacts: Artifact[] = [
      {
        id: 'a1',
        title: 'District demographics brief',
        kind: 'document',
        snippet: 'Census-derived breakdown of voting-age population.',
      },
      {
        id: 'a2',
        title: 'Past council meeting minutes',
        kind: 'link',
        snippet: 'Public minutes from Q1 meetings.',
        url: 'https://example.com/minutes',
      },
    ]
    const provider = new InMemoryArtifactsProvider(artifacts)
    const tool = buildGetArtifactsTool({ provider })

    const out = await tool.execute({})

    expect(out).toEqual(artifacts)
  })

  it('filters by case-insensitive substring on title or snippet', async () => {
    const artifacts: Artifact[] = [
      {
        id: 'a1',
        title: 'Housing affordability research',
        kind: 'document',
        snippet: 'Rent and ownership trends in district 4.',
      },
      {
        id: 'a2',
        title: 'Transit ridership data',
        kind: 'document',
        snippet: 'Daily bus and rail counts.',
      },
      {
        id: 'a3',
        title: 'Community survey',
        kind: 'note',
        snippet: 'Top concern listed by residents was HOUSING costs.',
      },
    ]
    const provider = new InMemoryArtifactsProvider(artifacts)
    const tool = buildGetArtifactsTool({ provider })

    const out = await tool.execute({ topic: 'housing' })

    expect(out.map((a) => a.id)).toEqual(['a1', 'a3'])
  })

  it('returns an empty array when no artifact matches the topic', async () => {
    const artifacts: Artifact[] = [
      {
        id: 'a1',
        title: 'Transit ridership data',
        kind: 'document',
        snippet: 'Bus counts.',
      },
    ]
    const provider = new InMemoryArtifactsProvider(artifacts)
    const tool = buildGetArtifactsTool({ provider })

    const out = await tool.execute({ topic: 'space exploration' })

    expect(out).toEqual([])
  })
})
