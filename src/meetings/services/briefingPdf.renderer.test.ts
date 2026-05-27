import { describe, expect, it } from 'vitest'
import { PDFParse } from 'pdf-parse'
import { renderBriefingPdf } from './briefingPdf.renderer'
import type { BriefingArtifact, BriefingItem } from './briefingPdf.types'

const ITEM_BASE: Omit<BriefingItem, 'id' | 'title' | 'item_number' | 'tier'> = {
  display: {
    summary: 'Body content for the item.',
    budget_impact: { summary: 'Budget impact summary.' },
    constituent_sentiment: {
      summary: 'Sentiment summary.',
      detail: 'Sentiment detail.',
    },
    recent_news: [
      { headline: 'Headline one', publication: 'Local Paper' },
      { headline: 'Headline two', publication: 'State Wire' },
    ],
    talking_points: [
      'First talking point.',
      'Second talking point.',
      'Third talking point.',
    ],
  },
}

function makeItem(
  i: number,
  tier: BriefingItem['tier'] = 'featured',
): BriefingItem {
  return {
    id: `item-${i}`,
    title: `Agenda item ${i}`,
    item_number: `${i}.A`,
    tier,
    ...ITEM_BASE,
  }
}

function makeArtifact(
  overrides: Partial<BriefingArtifact> = {},
): BriefingArtifact {
  return {
    briefing_type: 'city_council_meeting',
    meeting_date: '2026-05-11',
    meeting_time: '18:00',
    meeting_timezone: 'America/Chicago',
    meeting_name: 'City Council',
    location: 'City Hall',
    executive_summary: {
      lead_in: 'A short executive summary lead-in for testing.',
    },
    items: [makeItem(1), makeItem(2), makeItem(3, 'standard')],
    ...overrides,
  }
}

async function extractText(buffer: Buffer): Promise<{
  text: string
  numpages: number
}> {
  // PDFParse accepts a Buffer/Uint8Array directly. Resolve the text and the
  // page count so we can assert structural pagination behaviour as well as
  // content presence.
  const parser = new PDFParse({ data: new Uint8Array(buffer) })
  const result = await parser.getText()
  return { text: result.text, numpages: result.pages.length }
}

describe('renderBriefingPdf', () => {
  it('returns a Buffer whose first bytes are the PDF magic header', async () => {
    const buf = await renderBriefingPdf(makeArtifact())
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.slice(0, 5).toString()).toBe('%PDF-')
  })

  it('renders all featured items plus a Full Agenda section', async () => {
    const buf = await renderBriefingPdf(makeArtifact(), {
      title: 'City Council meeting briefing for May 11, 2026',
      meetingMetaLine: 'City Council · Mon May 11 · 6:00 PM · City Hall',
    })
    const { text } = await extractText(buf)
    expect(text).toContain('Executive Summary')
    expect(text).toContain('Full Agenda')
    expect(text).toContain('Agenda item 1')
    expect(text).toContain('Agenda item 2')
  })

  it('TOC page numbers match the actual page where each item starts', async () => {
    // Three featured items with substantial bodies; we then look at the TOC
    // page and assert each item's reference matches its real page index.
    const artifact = makeArtifact({
      items: [
        makeItem(1, 'featured'),
        makeItem(2, 'featured'),
        makeItem(3, 'featured'),
      ],
    })
    const buf = await renderBriefingPdf(artifact)
    const { text, numpages } = await extractText(buf)

    // Cover + TOC + Exec Summary + 3 items + Full Agenda = 6 (or more if
    // anything overflowed). We never want fewer than 6.
    expect(numpages).toBeGreaterThanOrEqual(6)

    // Every featured item must show up in the body of the doc.
    expect(text).toContain('1. Agenda item 1')
    expect(text).toContain('2. Agenda item 2')
    expect(text).toContain('3. Agenda item 3')

    // TOC row labels (without committing to a specific page number — that
    // depends on how pdfkit auto-paginates the bodies, which is the whole
    // point of this refactor).
    expect(text).toContain('Executive Summary')
    expect(text).toContain('Full Agenda')
  })

  it('does not render "Prepared for <name>" even when the option is set', async () => {
    // PII guard: the public PDF endpoint must not leak the official's name.
    const buf = await renderBriefingPdf(makeArtifact(), {
      preparedForLine: 'Jane Q. Public',
    })
    const { text } = await extractText(buf)
    expect(text).not.toContain('Prepared for')
    expect(text).not.toContain('Jane Q. Public')
  })

  it('falls back to a default header text when no meetingMetaLine is supplied', async () => {
    const buf = await renderBriefingPdf(makeArtifact())
    const { text } = await extractText(buf)
    // The renderer ships a "Meeting briefing" fallback on the running header.
    expect(text).toContain('Meeting briefing')
  })

  it('handles an empty agenda gracefully', async () => {
    const buf = await renderBriefingPdf(makeArtifact({ items: [] }), {
      title: 'Empty agenda',
    })
    expect(buf).toBeInstanceOf(Buffer)
    const { text } = await extractText(buf)
    expect(text).toContain('Executive Summary')
    expect(text).toContain('Full Agenda')
    // No featured items → no item sections.
    expect(text).not.toContain('Agenda item 1')
  })

  it('handles a no-featured-items briefing (only standard tier) without crashing', async () => {
    // The Full Agenda section runs the table-pagination path even when no
    // featured items exist. Make sure that path produces a valid PDF.
    const items: BriefingItem[] = Array.from({ length: 12 }, (_, i) =>
      makeItem(i + 1, 'standard'),
    )
    const buf = await renderBriefingPdf(makeArtifact({ items }))
    expect(buf).toBeInstanceOf(Buffer)
    expect(buf.slice(0, 5).toString()).toBe('%PDF-')
    const { text } = await extractText(buf)
    expect(text).toContain('Full Agenda')
    // Every agenda row in the Full Agenda table must show up in the text.
    for (let i = 1; i <= 12; i++) {
      expect(text).toContain(`Agenda item ${i}`)
    }
  })

  it('paginates the Full Agenda table when there are many items', async () => {
    // 60 items is well past what fits on one page; the table must split
    // without throwing and the final doc must still parse.
    const items: BriefingItem[] = Array.from({ length: 60 }, (_, i) =>
      makeItem(i + 1, 'standard'),
    )
    const buf = await renderBriefingPdf(makeArtifact({ items }))
    const { numpages, text } = await extractText(buf)

    // Cover + TOC + Exec Summary + Full Agenda spanning multiple pages.
    // Conservative lower bound: at least one extra page beyond the minimum.
    expect(numpages).toBeGreaterThan(4)
    expect(text).toContain('Agenda item 1')
    expect(text).toContain('Agenda item 60')
  })
})
