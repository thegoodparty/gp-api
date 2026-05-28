import { Inject, Injectable } from '@nestjs/common'
import { OCR_PROVIDER, OcrInput, OcrProvider, OcrResult } from '../ocr.types'

/**
 * Image extraction delegates straight to the OcrProvider. The provider
 * decides how to read the file (S3 reference, inline bytes, etc.).
 */
@Injectable()
export class ImageOcrExtractor {
  constructor(@Inject(OCR_PROVIDER) private readonly provider: OcrProvider) {}

  async extract(input: OcrInput): Promise<OcrResult> {
    return this.provider.run(input)
  }
}
