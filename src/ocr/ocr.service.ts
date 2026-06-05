import { BadRequestException, Injectable } from '@nestjs/common'
import { OcrStatus } from '../generated/prisma'
import { ImageOcrExtractor } from './extractors/image.extractor'
import { PdfOcrExtractor } from './extractors/pdf.extractor'
import { DocxOcrExtractor } from './extractors/docx.extractor'
import { PlaintextOcrExtractor } from './extractors/plaintext.extractor'
import { OcrInput, OcrResult } from './ocr.types'

export type OcrProcessResult = OcrResult & {
  /** Whether the result represents a real OCR run or a no-op extraction. */
  ocrStatus: OcrStatus
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/**
 * Dispatches OCR / extraction by mime type. The consumer only talks to this
 * service — it doesn't know about Textract, pdf-parse, or mammoth.
 */
@Injectable()
export class OcrService {
  constructor(
    private readonly image: ImageOcrExtractor,
    private readonly pdf: PdfOcrExtractor,
    private readonly docx: DocxOcrExtractor,
    private readonly plaintext: PlaintextOcrExtractor,
  ) {}

  async process(input: OcrInput): Promise<OcrProcessResult> {
    if (input.mimeType.startsWith('image/')) {
      const result = await this.image.extract(input)
      return { ...result, ocrStatus: OcrStatus.completed }
    }
    if (input.mimeType === 'application/pdf') {
      const result = await this.pdf.extract(input)
      return { ...result, ocrStatus: OcrStatus.completed }
    }
    if (input.mimeType === DOCX_MIME) {
      const result = await this.docx.extract(input)
      return { ...result, ocrStatus: OcrStatus.completed }
    }
    if (input.mimeType === 'text/plain') {
      const result = await this.plaintext.extract(input)
      return { ...result, ocrStatus: OcrStatus.skipped }
    }
    throw new BadRequestException(`unsupported_mime_type:${input.mimeType}`)
  }
}
