import { Module } from '@nestjs/common'
import { AwsModule } from '@/vendors/aws/aws.module'
import { OcrService } from './ocr.service'
import { ImageOcrExtractor } from './extractors/image.extractor'
import { PdfOcrExtractor } from './extractors/pdf.extractor'
import { DocxOcrExtractor } from './extractors/docx.extractor'
import { PlaintextOcrExtractor } from './extractors/plaintext.extractor'
import { TextractOcrProvider } from './providers/textract.provider'
import { OCR_PROVIDER } from './ocr.types'

/**
 * The OCR module exposes a single seam, `OcrService`, that hides which
 * provider (Textract today; could be GCV / Azure / self-hosted tomorrow)
 * actually runs OCR. Only the OCR_PROVIDER binding below knows about the
 * vendor.
 *
 * To swap providers later: write a new class implementing OcrProvider and
 * replace `TextractOcrProvider` in the OCR_PROVIDER `useClass`. No other
 * file changes.
 */
@Module({
  imports: [AwsModule],
  providers: [
    OcrService,
    ImageOcrExtractor,
    PdfOcrExtractor,
    DocxOcrExtractor,
    PlaintextOcrExtractor,
    TextractOcrProvider,
    {
      provide: OCR_PROVIDER,
      useExisting: TextractOcrProvider,
    },
  ],
  exports: [OcrService],
})
export class OcrModule {}
