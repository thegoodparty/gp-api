import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { PDFParse } from 'pdf-parse'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { OcrInput, OcrResult } from '../ocr.types'

const MAX_BUFFER_BYTES = 20 * 1024 * 1024

/**
 * PDF extraction. Phase 2 v1 only reads the text layer — most council
 * agendas have one. Scanned PDFs return COMPLETED with empty text; a
 * Phase 3 follow-up will add Textract async (StartDocumentTextDetection)
 * as the OcrProvider fallback for multi-page scanned PDFs.
 */
@Injectable()
export class PdfOcrExtractor {
  constructor(private readonly s3: S3Service) {}

  async extract(input: OcrInput): Promise<OcrResult> {
    const bytes = await this.s3.getFileBytes(input.bucket, input.key)
    if (!bytes) {
      throw new NotFoundException('attachment_object_missing')
    }
    if (bytes.length > MAX_BUFFER_BYTES) {
      throw new BadRequestException('attachment_too_large')
    }
    const parser = new PDFParse({
      data: new Uint8Array(bytes),
    })
    try {
      const result = await parser.getText()
      return {
        text: (result.text ?? '').trim(),
        confidence: null,
        meta: {
          extractor: 'pdf-parse',
          pages: result.total ?? null,
        },
      }
    } finally {
      await parser.destroy()
    }
  }
}
