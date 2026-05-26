import { Injectable, NotFoundException } from '@nestjs/common'
import mammoth from 'mammoth'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { OcrInput, OcrResult } from '../ocr.types'

/**
 * DOCX extraction via mammoth. No OCR needed — the bytes are the text.
 */
@Injectable()
export class DocxOcrExtractor {
  constructor(private readonly s3: S3Service) {}

  async extract(input: OcrInput): Promise<OcrResult> {
    const bytes = await this.s3.getFileBytes(input.bucket, input.key)
    if (!bytes) {
      throw new NotFoundException('attachment_object_missing')
    }
    const result = await mammoth.extractRawText({ buffer: bytes })
    return {
      text: (result.value ?? '').trim(),
      confidence: null,
      meta: {
        extractor: 'mammoth',
        warnings: result.messages?.length ?? 0,
      },
    }
  }
}
