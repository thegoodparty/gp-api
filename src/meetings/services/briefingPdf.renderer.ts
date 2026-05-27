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

interface PageInfo {
  isCover: boolean
}

/**
 * Render a meeting briefing artifact to a PDF buffer using pdfkit.
 *
 * Layout mirrors gp-webapp/app/shared/briefings/pdf/BriefingPdfDocument.tsx
 * (react-pdf). Page numbers in the TOC are computed the same way the legacy
 * doc does (`4 + i`, assuming one page per featured item) for visual parity.
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

    drawCoverPage(doc, briefing, options, liveQrPngBuffer)
    pages.push({ isCover: true })

    addContentPage(doc, pages)
    drawTocPage(doc, featured)

    addContentPage(doc, pages)
    drawExecutiveSummaryPage(doc, briefing, featured)

    featured.forEach((item, i) => {
      addContentPage(doc, pages)
      drawItemPage(doc, item, i + 1, briefing.items.length)
    })

    addContentPage(doc, pages)
    drawFullAgendaPage(doc, briefing, featured)

    drawRunningChrome(doc, pages, options.meetingMetaLine)

    doc.end()
  })
}

function addContentPage(doc: PDFKit.PDFDocument, pages: PageInfo[]): void {
  doc.addPage({
    size: 'LETTER',
    margins: {
      top: PAGE_PADDING_TOP,
      bottom: PAGE_PADDING_BOTTOM,
      left: PAGE_PADDING_X,
      right: PAGE_PADDING_X,
    },
  })
  pages.push({ isCover: false })
  doc.x = PAGE_PADDING_X
  doc.y = PAGE_PADDING_TOP + 28
  doc.font(FONT.regular).fontSize(BODY_FONT_SIZE).fillColor(COLOR.body)
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

  if (options.preparedForLine) {
    doc
      .font(FONT.regular)
      .fontSize(12)
      .fillColor(COLOR.body)
      .text(`Prepared for ${options.preparedForLine}`, contentLeft, cursorY, {
        width: contentWidth,
        align: 'center',
      })
    cursorY = doc.y + 4
  }

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

function drawTocPage(doc: PDFKit.PDFDocument, featured: BriefingItem[]): void {
  drawH1(doc, 'Table of Contents')
  doc.moveDown(0.4)

  const startY = doc.y
  let rowY = startY
  const rowGap = 28

  rowY = drawTocRow(doc, rowY, 'Executive Summary', '3')
  featured.forEach((item, i) => {
    rowY = drawTocRow(doc, rowY, `${i + 1}. ${item.title}`, String(4 + i))
  })
  rowY = drawTocRow(
    doc,
    rowY,
    `${featured.length + 1}. Full Agenda`,
    String(4 + featured.length),
  )
  // suppress unused var lint
  void rowGap
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
    drawSummaryTable(
      doc,
      featured.map((item, i) => ({
        num: String(i + 1),
        item: item.title,
        detail: `See p. ${4 + i}`,
        bold: true,
      })),
    )
  }
}

function drawItemPage(
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

  const featuredPageMap = new Map<string, number>()
  featured.forEach((item, i) => {
    featuredPageMap.set(item.id, 4 + i)
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
  )
}

interface SummaryRow {
  num: string
  item: string
  detail: string
  bold: boolean
}

function drawSummaryTable(doc: PDFKit.PDFDocument, rows: SummaryRow[]): void {
  const left = PAGE_PADDING_X
  const headerH = 28

  doc.rect(left, doc.y, CONTENT_W, headerH).fill(COLOR.navy)
  doc
    .font(FONT.bold)
    .fontSize(10)
    .fillColor(COLOR.white)
    .text('#', left + 12, doc.y - headerH + 10, { width: COL_NUM_W - 24 })
  doc.text('Item', left + COL_NUM_W + 12, doc.y - 12, {
    width: COL_ITEM_W - 24,
  })
  doc.text('Detail', left + COL_NUM_W + COL_ITEM_W + 12, doc.y - 12, {
    width: COL_DETAIL_W - 24,
    align: 'right',
  })

  let rowY = doc.y + headerH - 12 + 14

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const padV = 10
    const padH = 12
    const itemFont = row.bold ? FONT.bold : FONT.regular

    doc.font(itemFont).fontSize(BODY_FONT_SIZE)
    const itemHeight = doc.heightOfString(row.item, {
      width: COL_ITEM_W - 2 * padH,
    })
    const rowH = Math.max(itemHeight + 2 * padV, 24)

    if (i % 2 === 0) {
      doc.rect(left, rowY, CONTENT_W, rowH).fill(COLOR.rowAlt)
    }

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
  meetingMetaLine?: string,
): void {
  const { start, count } = doc.bufferedPageRange()
  for (let i = 0; i < count; i++) {
    const info = pages[i]
    if (!info || info.isCover) continue

    doc.switchToPage(start + i)
    drawRunningHeader(doc, meetingMetaLine)
    drawRunningFooter(doc, start + i + 1, count)
  }
}

function drawRunningHeader(
  doc: PDFKit.PDFDocument,
  meetingMetaLine?: string,
): void {
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

  const metaText = meetingMetaLine ?? 'Meeting briefing'
  const brandText = 'GoodParty.org'

  doc.font(FONT.regular).fontSize(9)
  const brandWidth = doc.widthOfString(brandText)
  const metaLeft = left + logoSize + 8
  const metaWidth = right - metaLeft - brandWidth - 16

  doc
    .font(FONT.bold)
    .fontSize(12)
    .fillColor(COLOR.navy)
    .text(metaText, metaLeft, top, {
      width: metaWidth,
      lineBreak: false,
      ellipsis: true,
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
