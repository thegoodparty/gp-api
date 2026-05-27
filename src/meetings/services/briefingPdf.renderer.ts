import { Buffer } from 'buffer'
import path from 'path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import SVGtoPDF from 'svg-to-pdfkit'

import {
  BODY_FONT_SIZE,
  COLOR,
  FONT,
  HEART_STAR_SVG,
  PAGE_PADDING_BOTTOM,
  PAGE_PADDING_TOP,
  PAGE_PADDING_X,
} from './briefingPdf.theme'
import {
  BriefingArtifact,
  BriefingItem,
  RenderBriefingPdfOptions,
} from './briefingPdf.types'

const ASSET_FONT_DIR = path.join(__dirname, '..', 'assets', 'fonts')
const FONT_REGULAR_PATH = path.join(ASSET_FONT_DIR, 'OpenSans-Regular.ttf')
const FONT_BOLD_PATH = path.join(ASSET_FONT_DIR, 'OpenSans-Bold.ttf')
const FONT_ITALIC_PATH = path.join(ASSET_FONT_DIR, 'OpenSans-Italic.ttf')

const LETTER_W = 612
const LETTER_H = 792
const CONTENT_W = LETTER_W - 2 * PAGE_PADDING_X

const FEATURED_TIERS = new Set(['featured', 'queued'])

// `COL_NUM_W` has to fit values like "21.A" or "22.D" at body font size.
// 44pt only left ~20pt for the text (after 12pt horizontal padding on each
// side), so 4-character agenda numbers were wrapping to two lines. 60pt gives
// ~36pt of text width, enough for "21.A.1" style sub-items too.
const COL_NUM_W = 60
const COL_DETAIL_W = 90
const COL_ITEM_W = CONTENT_W - COL_NUM_W - COL_DETAIL_W

type PageKind = 'cover' | 'toc' | 'content'

interface PageInfo {
  kind: PageKind
}

/**
 * Render a meeting briefing artifact to a PDF buffer using pdfkit.
 *
 * Layout mirrors gp-webapp/app/shared/briefings/pdf/BriefingPdfDocument.tsx
 * (react-pdf), but with one structural improvement: page references in the
 * TOC and the Full Agenda's "See p. N" column are captured from the actual
 * buffered-page index at draw time, so items whose body overflows a single
 * page no longer desync the cross-references. The TOC page is reserved
 * up-front and drawn last via `switchToPage` once all content pages exist.
 */
export async function renderBriefingPdf(
  briefing: BriefingArtifact,
  options: RenderBriefingPdfOptions = {},
): Promise<Buffer> {
  const liveQrPngBuffer = options.liveBriefingUrl
    ? await QRCode.toBuffer(options.liveBriefingUrl, { margin: 1, scale: 4 })
    : undefined

  return await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      autoFirstPage: false,
      margin: 0,
      bufferPages: true,
      info: {
        Title: options.title ?? 'Meeting briefing',
        Author: 'GoodParty.org',
        Subject: 'Meeting Briefing',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    doc.registerFont(FONT.regular, FONT_REGULAR_PATH)
    doc.registerFont(FONT.bold, FONT_BOLD_PATH)
    doc.registerFont(FONT.italic, FONT_ITALIC_PATH)

    const pages: PageInfo[] = []
    const featured = briefing.items.filter((item) =>
      FEATURED_TIERS.has(item.tier),
    )

    // 1. Cover (always page index 0).
    drawCoverPage(doc, briefing, options, liveQrPngBuffer)
    pages.push({ kind: 'cover' })

    // 2. Reserve TOC pages. The TOC has 1 Executive Summary row + 1 row per
    //    featured item + 1 Full Agenda row. Each row is ~28pt tall in the
    //    content area (~700pt), so ~25 rows fit per page. We round up
    //    conservatively to 20 rows/page to leave headroom for long titles
    //    that wrap onto a second line. With the typical ~6 featured items
    //    this still reserves one page; meetings with 20+ featured items
    //    quietly get a second TOC page rather than overflowing into a
    //    disjointed trailing page at the end of the buffer (which is what
    //    pdfkit's auto-pagination does when you `switchToPage` and overflow).
    const TOC_ROWS_PER_PAGE = 20
    const tocRowCount = featured.length + 2
    const tocPagesNeeded = Math.max(
      1,
      Math.ceil(tocRowCount / TOC_ROWS_PER_PAGE),
    )
    const tocPageIndices: number[] = []
    for (let p = 0; p < tocPagesNeeded; p++) {
      addContentPage(doc, pages, 'toc')
      tocPageIndices.push(currentPageIndex(doc))
    }

    // 3. Executive summary. The table inside paginates on its own if there
    //    are enough featured items to need more than one page.
    addContentPage(doc, pages, 'content')
    const execSummaryPageIndex = currentPageIndex(doc)
    drawExecutiveSummaryPage(doc, briefing, featured, pages)

    // 4. One section per featured item. pdfkit auto-paginates the text body
    //    on its own; we capture the first page of each item before drawing
    //    so the TOC / "See p. N" labels point at the right one.
    const itemPageIndices: number[] = []
    featured.forEach((item, i) => {
      addContentPage(doc, pages, 'content')
      itemPageIndices.push(currentPageIndex(doc))
      drawItemPage(doc, item, i + 1, briefing.items.length, pages)
    })

    // 5. Full agenda — its table almost always overflows on real councils,
    //    so the table helper takes care of cross-page row striping.
    addContentPage(doc, pages, 'content')
    const fullAgendaPageIndex = currentPageIndex(doc)
    drawFullAgendaPage(
      doc,
      briefing,
      featured,
      itemPageIndices.map(toOneBased),
      pages,
    )

    // 6. Fill in the TOC with the real page numbers we just captured.
    //    `drawTocPage` paginates internally across the pre-reserved pages.
    drawTocPage(
      doc,
      featured,
      {
        execSummary: toOneBased(execSummaryPageIndex),
        featured: itemPageIndices.map(toOneBased),
        fullAgenda: toOneBased(fullAgendaPageIndex),
      },
      tocPageIndices,
    )

    // 7. Draw running header/footer on every non-cover page. We iterate the
    //    full buffer (so any overflow page auto-added by pdfkit gets chrome
    //    too) and skip whichever page we marked as the cover. The header
    //    line is the recipient-aware "Briefing for X – Y meeting – Z date"
    //    label; the cover keeps the wider `meetingMetaLine` for venue/time.
    drawRunningChrome(doc, pages, options.headerLine ?? options.meetingMetaLine)

    doc.end()
  })
}

/**
 * Append a new portrait letter page configured with the standard content
 * margins, reset the text cursor to the top of the content area, and record
 * its kind so the chrome pass can skip the cover.
 */
function addContentPage(
  doc: PDFKit.PDFDocument,
  pages: PageInfo[],
  kind: PageKind,
): void {
  doc.addPage({
    size: 'LETTER',
    margins: {
      top: PAGE_PADDING_TOP,
      bottom: PAGE_PADDING_BOTTOM,
      left: PAGE_PADDING_X,
      right: PAGE_PADDING_X,
    },
  })
  pages.push({ kind })
  doc.x = PAGE_PADDING_X
  doc.y = PAGE_PADDING_TOP + 28
  doc.font(FONT.regular).fontSize(BODY_FONT_SIZE).fillColor(COLOR.body)
}

/** 0-based index of the most-recently-buffered page. */
function currentPageIndex(doc: PDFKit.PDFDocument): number {
  return doc.bufferedPageRange().count - 1
}

function toOneBased(zeroBased: number): number {
  return zeroBased + 1
}

function drawCoverPage(
  doc: PDFKit.PDFDocument,
  briefing: BriefingArtifact,
  options: RenderBriefingPdfOptions,
  qrPng: Buffer | undefined,
): void {
  doc.addPage({
    size: 'LETTER',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  })

  const inset = 16
  const innerX = inset
  const innerY = inset
  const innerW = LETTER_W - 2 * inset
  const innerH = LETTER_H - 2 * inset

  doc
    .lineWidth(1)
    .strokeColor(COLOR.coverBorder)
    .rect(innerX, innerY, innerW, innerH)
    .stroke()

  const innerPaddingX = 64
  const contentLeft = innerX + innerPaddingX
  const contentRight = innerX + innerW - innerPaddingX
  const contentWidth = contentRight - contentLeft

  let cursorY = innerY + 80

  const logoSize = 72
  SVGtoPDF(doc, HEART_STAR_SVG, (LETTER_W - logoSize) / 2, cursorY, {
    width: logoSize,
    height: (logoSize * 130) / 160,
    preserveAspectRatio: 'xMidYMid meet',
  })
  cursorY += (logoSize * 130) / 160 + 18

  doc
    .font(FONT.bold)
    .fontSize(26)
    .fillColor(COLOR.body)
    .text('GoodParty.org', contentLeft, cursorY, {
      width: contentWidth,
      align: 'center',
    })
  cursorY = doc.y + 10

  doc
    .font(FONT.regular)
    .fontSize(10)
    .fillColor(COLOR.muted)
    .text('EMPOWERING PEOPLE TO RUN, WIN, AND SERVE', contentLeft, cursorY, {
      width: contentWidth,
      align: 'center',
      characterSpacing: 2.5,
    })

  cursorY = innerY + 80 + (logoSize * 130) / 160 + 18 + 26 + 10 + 96

  doc
    .font(FONT.bold)
    .fontSize(30)
    .fillColor(COLOR.navy)
    .text('Meeting Briefing', contentLeft, cursorY, {
      width: contentWidth,
      align: 'center',
    })
  cursorY = doc.y + 28

  const titleText = options.title ?? 'Meeting briefing'
  doc
    .font(FONT.bold)
    .fontSize(18)
    .fillColor(COLOR.navy)
    .text(titleText, contentLeft, cursorY, {
      width: contentWidth,
      align: 'center',
    })
  cursorY = doc.y + 18

  // The cover no longer carries a separate "Prepared for <name>" block —
  // that information is now consolidated into the running header (which
  // appears on every non-cover page) so any single page of the printed
  // PDF identifies both the recipient and the meeting.
  const metaLine = options.meetingMetaLine ?? briefing.meeting_date ?? ''
  if (metaLine) {
    doc
      .font(FONT.italic)
      .fontSize(11)
      .fillColor(COLOR.body)
      .text(metaLine, contentLeft, cursorY, {
        width: contentWidth,
        align: 'center',
      })
    cursorY = doc.y
  }

  if (qrPng && options.liveBriefingUrl) {
    cursorY += 48
    const qrSize = 80
    const blockGap = 18
    const labelText = 'VIEW YOUR LIVE BRIEFING'
    doc.font(FONT.bold).fontSize(9)
    const labelWidth = Math.min(
      doc.widthOfString(labelText, { characterSpacing: 2 }),
      contentWidth - qrSize - blockGap,
    )
    const urlText = options.liveBriefingUrl
    doc.font(FONT.regular).fontSize(11)
    const urlWidth = Math.min(
      doc.widthOfString(urlText),
      contentWidth - qrSize - blockGap,
    )
    const textBlockWidth = Math.max(labelWidth, urlWidth)
    const blockWidth = qrSize + blockGap + textBlockWidth
    const blockStartX = contentLeft + (contentWidth - blockWidth) / 2

    doc.image(qrPng, blockStartX, cursorY, { width: qrSize, height: qrSize })

    const textX = blockStartX + qrSize + blockGap
    doc
      .font(FONT.bold)
      .fontSize(9)
      .fillColor(COLOR.muted)
      .text(labelText, textX, cursorY + 4, {
        width: textBlockWidth,
        characterSpacing: 2,
      })
    const labelEndY = doc.y + 4

    doc
      .font(FONT.regular)
      .fontSize(11)
      .fillColor(COLOR.red)
      .text(urlText, textX, labelEndY, {
        width: textBlockWidth,
        underline: true,
        link: urlText,
      })
  }

  const disclaimerY = innerY + innerH - 56 - 32
  doc
    .font(FONT.italic)
    .fontSize(9)
    .fillColor(COLOR.muted)
    .text(
      'Briefing prepared by GoodParty.org using public agenda data, constituent sentiment, and local news coverage. · v1.0',
      innerX + 80,
      disclaimerY,
      {
        width: innerW - 160,
        align: 'center',
        lineGap: 2,
      },
    )
}

interface TocPageNumbers {
  execSummary: number
  featured: number[]
  fullAgenda: number
}

/**
 * Render the TOC across `tocPageIndices`. We pre-reserved these pages in
 * `renderBriefingPdf` so that:
 *   (a) the TOC always sits immediately after the cover (page numbers
 *       remain meaningful), and
 *   (b) overflow stays inside the reserved range — pdfkit's auto-pagination
 *       when you `switchToPage` then overflow would otherwise append the
 *       extra page to the *end* of the buffer rather than after the TOC.
 *
 * We switch to the first reserved page, render the title + rows there,
 * and move on to the next reserved page when `rowY` would dip below the
 * bottom of the content area. If the TOC has more rows than we reserved
 * space for (shouldn't happen given the conservative estimate, but
 * defending against future contract changes), we truncate with a final
 * "… and N more in the Full Agenda" row rather than silently dropping
 * entries.
 */
function drawTocPage(
  doc: PDFKit.PDFDocument,
  featured: BriefingItem[],
  pageNumbers: TocPageNumbers,
  tocPageIndices: number[],
): void {
  if (tocPageIndices.length === 0) return

  let pageCursor = 0
  let rowY = 0
  // Leave ~24pt below the bottom rule so the running footer doesn't collide.
  const bottomLimit = LETTER_H - PAGE_PADDING_BOTTOM - 32

  /** Switch to the next reserved page (or no-op if we're already there). */
  const switchToTocPage = (cursor: number): void => {
    doc.switchToPage(tocPageIndices[cursor])
    doc.x = PAGE_PADDING_X
    doc.y = PAGE_PADDING_TOP + 28
    if (cursor === 0) {
      drawH1(doc, 'Table of Contents')
      doc.moveDown(0.4)
    } else {
      // Continuation pages get a smaller "(continued)" header so the reader
      // knows the list is still the same TOC, just on a new sheet.
      doc
        .font(FONT.bold)
        .fontSize(18)
        .fillColor(COLOR.navy)
        .text('Table of Contents (continued)', PAGE_PADDING_X, doc.y, {
          width: CONTENT_W,
        })
      doc.moveDown(0.4)
    }
    rowY = doc.y
  }

  switchToTocPage(pageCursor)

  /**
   * Draw `label / pageNumber` as one TOC row at the current `rowY`, paging
   * forward if the row would clip the footer area.
   */
  const drawRow = (label: string, pageNumber: string): boolean => {
    // Pre-measure: rows are ~28pt tall after a wrap; budget 36pt to be safe.
    if (rowY + 36 > bottomLimit) {
      pageCursor += 1
      if (pageCursor >= tocPageIndices.length) {
        // Out of reserved pages. Append a single hint row to the *last*
        // page we did render so users know more items exist. Switch back
        // to that page before appending.
        doc.switchToPage(tocPageIndices[tocPageIndices.length - 1])
        return false
      }
      switchToTocPage(pageCursor)
    }
    rowY = drawTocRow(doc, rowY, label, pageNumber)
    return true
  }

  if (!drawRow('Executive Summary', String(pageNumbers.execSummary))) {
    return
  }

  let truncatedAt: number | null = null
  for (let i = 0; i < featured.length; i++) {
    const item = featured[i]
    const ok = drawRow(
      `${i + 1}. ${item.title}`,
      String(pageNumbers.featured[i] ?? ''),
    )
    if (!ok) {
      truncatedAt = i
      break
    }
  }

  if (truncatedAt !== null) {
    // We ran out of reserved TOC space. Surface a hint instead of failing
    // silently. The current `rowY` was reset to the last reserved page by
    // `drawRow`; render the hint at whatever Y the page left us at, but
    // guard against clipping by appending near the bottom limit.
    const remaining = featured.length - truncatedAt
    const hintY = Math.min(rowY, bottomLimit - 24)
    doc
      .font(FONT.italic)
      .fontSize(10)
      .fillColor(COLOR.muted)
      .text(
        `… and ${remaining} more item${remaining === 1 ? '' : 's'} (see Full Agenda).`,
        PAGE_PADDING_X,
        hintY + 6,
        { width: CONTENT_W },
      )
    return
  }

  drawRow(`${featured.length + 1}. Full Agenda`, String(pageNumbers.fullAgenda))
}

function drawTocRow(
  doc: PDFKit.PDFDocument,
  y: number,
  label: string,
  pageNumber: string,
): number {
  const left = PAGE_PADDING_X
  const right = LETTER_W - PAGE_PADDING_X
  doc
    .font(FONT.regular)
    .fontSize(12)
    .fillColor(COLOR.body)
    .text(label, left, y + 10, { width: CONTENT_W - 40 })
  const labelBottom = doc.y

  doc
    .font(FONT.regular)
    .fontSize(11)
    .fillColor(COLOR.body)
    .text(pageNumber, left, y + 10, {
      width: CONTENT_W,
      align: 'right',
    })

  const rowBottom = Math.max(labelBottom, doc.y) + 6

  doc
    .lineWidth(0.5)
    .strokeColor(COLOR.rule)
    .moveTo(left, rowBottom)
    .lineTo(right, rowBottom)
    .stroke()

  return rowBottom + 4
}

function drawExecutiveSummaryPage(
  doc: PDFKit.PDFDocument,
  briefing: BriefingArtifact,
  featured: BriefingItem[],
  pages: PageInfo[],
): void {
  drawH1(doc, 'Executive Summary')
  doc
    .font(FONT.italic)
    .fontSize(BODY_FONT_SIZE)
    .fillColor(COLOR.muted)
    .text(briefing.executive_summary.lead_in, PAGE_PADDING_X, doc.y, {
      width: CONTENT_W,
      lineGap: 2,
    })
  doc.moveDown(0.6)

  if (featured.length > 0) {
    // Page numbers aren't known yet — the exec summary draws *before* the
    // item pages exist. We render the rows without an explicit "See p. N"
    // detail; the Full Agenda (drawn later) provides the canonical page
    // refs once they're captured.
    drawSummaryTable(
      doc,
      featured.map((item, i) => ({
        num: String(i + 1),
        item: item.title,
        detail: '',
        bold: true,
      })),
      pages,
    )
  }
}

function drawItemPage(
  doc: PDFKit.PDFDocument,
  item: BriefingItem,
  position: number,
  totalCount: number,
  pages: PageInfo[],
): void {
  // Any auto-paginated overflow page added by pdfkit while we draw this
  // item's body needs to be tracked so the chrome pass renders header +
  // footer on it. pdfkit emits `pageAdded` for both manual `addPage` and
  // auto-pagination; we listen scoped to this draw and remove the listener
  // afterwards so we don't double-count the manual cover/TOC additions.
  const onPageAdded = () => pages.push({ kind: 'content' })
  doc.on('pageAdded', onPageAdded)
  try {
    drawItemBody(doc, item, position, totalCount)
  } finally {
    doc.off('pageAdded', onPageAdded)
  }
}

function drawItemBody(
  doc: PDFKit.PDFDocument,
  item: BriefingItem,
  position: number,
  totalCount: number,
): void {
  const d = item.display

  drawH1(doc, `${position}. ${item.title}`)
  if (item.item_number) {
    doc
      .font(FONT.italic)
      .fontSize(BODY_FONT_SIZE)
      .fillColor(COLOR.muted)
      .text(
        `Agenda item ${item.item_number} of ${totalCount}.`,
        PAGE_PADDING_X,
        doc.y,
        { width: CONTENT_W },
      )
    doc.moveDown(0.8)
  }

  drawH2(doc, 'Overview')
  drawParagraph(doc, d.summary)

  if (d.budget_impact) {
    drawH2(doc, 'Budget impact')
    drawParagraph(doc, d.budget_impact.summary)
  }

  const sentiment = d.constituent_sentiment
  if (sentiment) {
    drawH2(doc, 'Constituent sentiment')
    drawParagraph(doc, sentiment.summary)
    if (sentiment.detail) {
      drawParagraph(doc, sentiment.detail)
    }
  }

  if (d.recent_news && d.recent_news.length > 0) {
    drawH2(doc, 'Recent news')
    for (const news of d.recent_news) {
      drawNewsBullet(doc, news.headline, news.publication)
    }
  }

  if (d.talking_points && d.talking_points.length > 0) {
    drawH2(doc, 'Talking points')
    for (const point of d.talking_points) {
      drawBullet(doc, point)
    }
  }
}

function drawFullAgendaPage(
  doc: PDFKit.PDFDocument,
  briefing: BriefingArtifact,
  featured: BriefingItem[],
  featuredPageNumbers: number[],
  pages: PageInfo[],
): void {
  drawH1(doc, 'Full Agenda')
  doc
    .font(FONT.italic)
    .fontSize(BODY_FONT_SIZE)
    .fillColor(COLOR.muted)
    .text(
      `All ${briefing.items.length} items, in order. The items in earlier sections are bolded with page references.`,
      PAGE_PADDING_X,
      doc.y,
      { width: CONTENT_W, lineGap: 2 },
    )
  doc.moveDown(0.6)

  // Map each featured item's id to the real (1-based) page number captured
  // when the item section started rendering. This replaces the old
  // `4 + i` formula which broke whenever any item overflowed onto a second
  // page.
  const featuredPageMap = new Map<string, number>()
  featured.forEach((item, i) => {
    const pageNumber = featuredPageNumbers[i]
    if (pageNumber !== undefined) {
      featuredPageMap.set(item.id, pageNumber)
    }
  })

  drawSummaryTable(
    doc,
    briefing.items.map((item, i) => {
      const featuredPage = featuredPageMap.get(item.id)
      return {
        num: item.item_number ?? String(i + 1),
        item: item.title,
        detail: featuredPage ? `See p. ${featuredPage}` : '',
        bold: !!featuredPage,
      }
    }),
    pages,
  )
}

interface SummaryRow {
  num: string
  item: string
  detail: string
  bold: boolean
}

/**
 * Draw a summary table starting at `doc.y`. The table is row-paginated:
 * when the next row wouldn't fit above the footer area, we add a new
 * content page, redraw the dark header bar, and continue. This prevents
 * the bug where the row-striping rectangles end up on a different page
 * than the row text after pdfkit auto-paginates the per-row `.text()` call.
 */
function drawSummaryTable(
  doc: PDFKit.PDFDocument,
  rows: SummaryRow[],
  pages: PageInfo[],
): void {
  const left = PAGE_PADDING_X
  const headerH = 28
  const padV = 10
  const padH = 12
  // Reserve room for the running footer (28pt rule + text below).
  const bottomLimit = LETTER_H - PAGE_PADDING_BOTTOM - 32

  // Draw the dark header bar at the current `doc.y` and return the `rowY`
  // immediately below it (where the first body row should start).
  const drawHeader = (): number => {
    const headerTop = doc.y
    doc.rect(left, headerTop, CONTENT_W, headerH).fill(COLOR.navy)
    doc
      .font(FONT.bold)
      .fontSize(10)
      .fillColor(COLOR.white)
      .text('#', left + padH, headerTop + 10, { width: COL_NUM_W - 2 * padH })
    doc.text('Item', left + COL_NUM_W + padH, headerTop + 10, {
      width: COL_ITEM_W - 2 * padH,
    })
    doc.text('Detail', left + COL_NUM_W + COL_ITEM_W + padH, headerTop + 10, {
      width: COL_DETAIL_W - 2 * padH,
      align: 'right',
    })
    return headerTop + headerH
  }

  let rowY = drawHeader()
  // Striping continues across page breaks — using the row index modulo 2
  // alone would restart on each new page, which looked off in QA. Track an
  // explicit alternating counter instead.
  let stripeIndex = 0

  for (const row of rows) {
    const itemFont = row.bold ? FONT.bold : FONT.regular
    doc.font(itemFont).fontSize(BODY_FONT_SIZE)
    const itemHeight = doc.heightOfString(row.item, {
      width: COL_ITEM_W - 2 * padH,
    })
    const rowH = Math.max(itemHeight + 2 * padV, 24)

    if (rowY + rowH > bottomLimit) {
      addContentPage(doc, pages, 'content')
      rowY = drawHeader()
    }

    if (stripeIndex % 2 === 0) {
      doc.rect(left, rowY, CONTENT_W, rowH).fill(COLOR.rowAlt)
    }
    stripeIndex++

    doc
      .font(itemFont)
      .fontSize(BODY_FONT_SIZE)
      .fillColor(COLOR.body)
      .text(row.num, left + padH, rowY + padV, {
        width: COL_NUM_W - 2 * padH,
      })
    doc.text(row.item, left + COL_NUM_W + padH, rowY + padV, {
      width: COL_ITEM_W - 2 * padH,
    })
    doc
      .font(FONT.regular)
      .fontSize(BODY_FONT_SIZE)
      .fillColor(COLOR.body)
      .text(row.detail, left + COL_NUM_W + COL_ITEM_W + padH, rowY + padV, {
        width: COL_DETAIL_W - 2 * padH,
        align: 'right',
      })

    rowY += rowH
  }

  doc.x = PAGE_PADDING_X
  doc.y = rowY + 8
}

function drawH1(doc: PDFKit.PDFDocument, text: string): void {
  doc
    .font(FONT.bold)
    .fontSize(28)
    .fillColor(COLOR.navy)
    .text(text, PAGE_PADDING_X, doc.y, { width: CONTENT_W })
  doc.moveDown(0.2)
}

function drawH2(doc: PDFKit.PDFDocument, text: string): void {
  doc.moveDown(0.6)
  doc
    .font(FONT.bold)
    .fontSize(14)
    .fillColor(COLOR.navy)
    .text(text, PAGE_PADDING_X, doc.y, { width: CONTENT_W })
  doc.moveDown(0.2)
}

function drawParagraph(doc: PDFKit.PDFDocument, text: string): void {
  doc
    .font(FONT.regular)
    .fontSize(BODY_FONT_SIZE)
    .fillColor(COLOR.body)
    .text(text, PAGE_PADDING_X, doc.y, {
      width: CONTENT_W,
      lineGap: 3,
    })
  doc.moveDown(0.4)
}

function drawBullet(doc: PDFKit.PDFDocument, text: string): void {
  const bulletIndent = 14
  const startY = doc.y
  doc
    .font(FONT.regular)
    .fontSize(BODY_FONT_SIZE)
    .fillColor(COLOR.body)
    .text('•', PAGE_PADDING_X, startY, { lineBreak: false })
    .text(text, PAGE_PADDING_X + bulletIndent, startY, {
      width: CONTENT_W - bulletIndent,
      lineGap: 2,
    })
  doc.moveDown(0.2)
}

function drawNewsBullet(
  doc: PDFKit.PDFDocument,
  headline: string,
  publication: string,
): void {
  const bulletIndent = 14
  const startY = doc.y
  doc
    .font(FONT.regular)
    .fontSize(BODY_FONT_SIZE)
    .fillColor(COLOR.body)
    .text('•', PAGE_PADDING_X, startY, { lineBreak: false })
    .text(`${headline} — `, PAGE_PADDING_X + bulletIndent, startY, {
      width: CONTENT_W - bulletIndent,
      lineGap: 2,
      continued: true,
    })
  doc
    .font(FONT.italic)
    .text(publication, { width: CONTENT_W - bulletIndent, lineGap: 2 })
  doc.moveDown(0.2)
}

function drawRunningChrome(
  doc: PDFKit.PDFDocument,
  pages: PageInfo[],
  headerLine?: string,
): void {
  // Walk the entire buffered page range — not just the entries we explicitly
  // recorded in `pages`. pdfkit auto-paginates `.text()` calls and the
  // overflow page won't always appear in `pages` even with our `pageAdded`
  // listener (the listener fires before the page is fully wired up in some
  // pdfkit code paths). Skipping by index, treating any page we *know* is a
  // cover as the only exclusion, guarantees every other page gets chrome.
  const { start, count } = doc.bufferedPageRange()
  for (let i = 0; i < count; i++) {
    const info = pages[i]
    if (info?.kind === 'cover') continue

    doc.switchToPage(start + i)
    drawRunningHeader(doc, headerLine)
    drawRunningFooter(doc, start + i + 1, count)
  }
}

function drawRunningHeader(doc: PDFKit.PDFDocument, headerLine?: string): void {
  const left = PAGE_PADDING_X
  const right = LETTER_W - PAGE_PADDING_X
  const top = 24

  // Logo + meeting identifier on the left (the prominent element — readers
  // glance at the top of any page to confirm "yes, this is the briefing for
  // X meeting on Y date"). GoodParty.org wordmark moves to the right at a
  // smaller size so the meeting still leads.
  const logoSize = 16
  SVGtoPDF(doc, HEART_STAR_SVG, left, top - 2, {
    width: logoSize,
    height: (logoSize * 130) / 160,
    preserveAspectRatio: 'xMidYMid meet',
  })

  const metaText = headerLine ?? 'Meeting briefing'
  const brandText = 'GoodParty.org'

  doc.font(FONT.regular).fontSize(9)
  const brandWidth = doc.widthOfString(brandText)
  const metaLeft = left + logoSize + 8
  const metaWidth = right - metaLeft - brandWidth - 16

  // pdfkit's `lineBreak: false` + `ellipsis: true` does not reliably enforce
  // a single line on long strings, so pre-truncate against the measured glyph
  // width and append an explicit ellipsis. This keeps the header line bounded
  // above the horizontal rule for long EO names and venues.
  doc.font(FONT.bold).fontSize(12)
  const displayMetaText = truncateToWidth(doc, metaText, metaWidth)

  doc.fillColor(COLOR.navy).text(displayMetaText, metaLeft, top, {
    width: metaWidth,
    lineBreak: false,
  })

  doc
    .font(FONT.regular)
    .fontSize(9)
    .fillColor(COLOR.muted)
    .text(brandText, right - brandWidth, top + 3, {
      width: brandWidth,
      lineBreak: false,
    })

  const ruleY = top + 24
  doc
    .lineWidth(1)
    .strokeColor(COLOR.rule)
    .moveTo(left, ruleY)
    .lineTo(right, ruleY)
    .stroke()
}

function drawRunningFooter(
  doc: PDFKit.PDFDocument,
  pageNumber: number,
  totalPages: number,
): void {
  const left = PAGE_PADDING_X
  const right = LETTER_W - PAGE_PADDING_X
  const ruleY = LETTER_H - 28 - 4
  const textY = LETTER_H - 28 + 4

  doc
    .lineWidth(1)
    .strokeColor(COLOR.rule)
    .moveTo(left, ruleY)
    .lineTo(right, ruleY)
    .stroke()

  doc.font(FONT.regular).fontSize(9).fillColor(COLOR.muted)
  doc.text('Prepared by ', left, textY, {
    continued: true,
    lineBreak: false,
  })
  doc
    .font(FONT.bold)
    .fillColor(COLOR.body)
    .text('GoodParty.org', { continued: true, lineBreak: false })
  doc
    .font(FONT.regular)
    .fillColor(COLOR.muted)
    .text(' · Empowering people to run, win, and serve', {
      lineBreak: false,
    })

  doc.font(FONT.regular).fillColor(COLOR.muted)
  const pageLabel = 'Page '
  const pageOfTotal = ` of ${totalPages}`
  const widthAll =
    doc.widthOfString(pageLabel) +
    doc.font(FONT.bold).widthOfString(String(pageNumber)) +
    doc.font(FONT.regular).widthOfString(pageOfTotal)
  doc.font(FONT.regular).fillColor(COLOR.muted)
  const startX = right - widthAll
  doc.text(pageLabel, startX, textY, { continued: true, lineBreak: false })
  doc
    .font(FONT.bold)
    .fillColor(COLOR.body)
    .text(String(pageNumber), { continued: true, lineBreak: false })
  doc
    .font(FONT.regular)
    .fillColor(COLOR.muted)
    .text(pageOfTotal, { lineBreak: false })
}

/**
 * Truncate `text` to fit inside `maxWidth` at the doc's currently active font
 * + size, appending an ellipsis when truncation is required. Returns the
 * original string unchanged when it already fits. Caller is responsible for
 * setting the desired font/size before calling — otherwise the measurement
 * won't match the eventual draw.
 */
function truncateToWidth(
  doc: PDFKit.PDFDocument,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return ''
  if (doc.widthOfString(text) <= maxWidth) return text
  const ellipsis = '…'
  const ellipsisWidth = doc.widthOfString(ellipsis)
  // Binary search for the longest prefix that, with the ellipsis, still fits.
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    const prefixWidth = doc.widthOfString(text.slice(0, mid))
    if (prefixWidth + ellipsisWidth <= maxWidth) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return `${text.slice(0, lo).trimEnd()}${ellipsis}`
}
