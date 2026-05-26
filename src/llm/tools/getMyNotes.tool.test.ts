import { describe, expect, it } from 'vitest'
import {
  buildGetMyNotesTool,
  InMemoryNotesProvider,
  type Note,
} from './getMyNotes.tool'

const NOTE_A: Note = {
  id: 'n1',
  body: 'Worried about enforcement on STR cap. Real estate lobby pushed hard.',
  jsonPath: '/priorityIssues/0/card/headline',
  highlightedText: 'Amendment to Short-Term Rental Ordinance',
  createdAt: '2026-05-10T15:00:00Z',
}

const NOTE_B: Note = {
  id: 'n2',
  body: 'Need fiscal impact in dollars before voting.',
  jsonPath: '/priorityIssues/1/card/headline',
  highlightedText: 'Authorize Cost-of-Service Water Rate Study',
  createdAt: '2026-05-11T09:00:00Z',
}

describe('getMyNotes tool', () => {
  it('returns every note the provider yields', async () => {
    const provider = new InMemoryNotesProvider([NOTE_A, NOTE_B])
    const tool = buildGetMyNotesTool({ provider })

    const out = await tool.execute({})

    expect(out).toEqual([NOTE_A, NOTE_B])
  })

  it('returns an empty array when the provider has no notes', async () => {
    const provider = new InMemoryNotesProvider([])
    const tool = buildGetMyNotesTool({ provider })

    const out = await tool.execute({})

    expect(out).toEqual([])
  })
})
