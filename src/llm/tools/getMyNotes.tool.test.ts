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
  it('returns all notes when no topic is provided', async () => {
    const provider = new InMemoryNotesProvider([NOTE_A, NOTE_B])
    const tool = buildGetMyNotesTool({ provider })

    const out = await tool.execute({})

    expect(out).toEqual([NOTE_A, NOTE_B])
  })

  it('filters by case-insensitive substring on body', async () => {
    const provider = new InMemoryNotesProvider([NOTE_A, NOTE_B])
    const tool = buildGetMyNotesTool({ provider })

    const out = await tool.execute({ topic: 'fiscal' })

    expect(out.map((n) => n.id)).toEqual(['n2'])
  })

  it('filters by case-insensitive substring on highlighted text', async () => {
    const provider = new InMemoryNotesProvider([NOTE_A, NOTE_B])
    const tool = buildGetMyNotesTool({ provider })

    const out = await tool.execute({ topic: 'rental' })

    expect(out.map((n) => n.id)).toEqual(['n1'])
  })

  it('returns an empty array when no note matches', async () => {
    const provider = new InMemoryNotesProvider([NOTE_A, NOTE_B])
    const tool = buildGetMyNotesTool({ provider })

    const out = await tool.execute({ topic: 'asteroid mining' })

    expect(out).toEqual([])
  })
})
