import { Injectable, NotFoundException } from '@nestjs/common'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { OcrInput, OcrResult } from '../ocr.types'

const MAX_PLAINTEXT_BYTES = 20 * 1024 * 1024 // matches attachment cap

/**
 * Plain text "extraction" — just read the bytes. Mapped to ocr_status
 * SKIPPED upstream because no OCR ran.
 */
@Injectable()
export class PlaintextOcrExtractor {
  constructor(private readonly s3: S3Service) {}

  async extract(input: OcrInput): Promise<OcrResult> {
    const text = await this.s3.getFile(input.bucket, input.key)
    if (text === undefined) {
      throw new NotFoundException('attachment_object_missing')
    }
    return {
      text: text.slice(0, MAX_PLAINTEXT_BYTES),
      confidence: null,
      meta: { extractor: 'plaintext' },
    }
  }
}
