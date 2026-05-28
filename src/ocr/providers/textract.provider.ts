import { Injectable } from '@nestjs/common'
import {
  DetectDocumentTextCommand,
  TextractClient,
} from '@aws-sdk/client-textract'
import { PinoLogger } from 'nestjs-pino'
import { OcrInput, OcrProvider, OcrResult } from '../ocr.types'

const { AWS_REGION: region = 'us-west-2' } = process.env

const SUPPORTED_MIME_TYPES = new Set<string>([
  'image/jpeg',
  'image/png',
  // Textract DetectDocumentText also accepts single-page PDF up to ~10 MB.
  // We route multi-page PDF through pdf-parse first; this is the fallback.
  'application/pdf',
])

/**
 * AWS Textract implementation of OcrProvider. Uses sync DetectDocumentText
 * against an S3-resident object — keeps us under the inline-bytes 5 MB
 * limit and avoids an extra download leg.
 *
 * For multi-page PDFs (Textract sync rejects >1 page) we rely on the pdf
 * extractor's text-layer path first. A Phase 3 follow-up can add the async
 * StartDocumentTextDetection flow for scanned multi-page PDFs.
 */
@Injectable()
export class TextractOcrProvider implements OcrProvider {
  readonly name = 'textract'
  private readonly client: TextractClient

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(TextractOcrProvider.name)
    this.client = new TextractClient({ region })
  }

  supports(mimeType: string): boolean {
    return SUPPORTED_MIME_TYPES.has(mimeType)
  }

  async run(input: OcrInput): Promise<OcrResult> {
    const response = await this.client.send(
      new DetectDocumentTextCommand({
        Document: {
          S3Object: { Bucket: input.bucket, Name: input.key },
        },
      }),
    )

    const lines = (response.Blocks ?? []).filter(
      (b) => b.BlockType === 'LINE' && typeof b.Text === 'string',
    )

    const text = lines
      .map((b) => b.Text)
      .filter((t): t is string => Boolean(t))
      .join('\n')

    const confidences = lines
      .map((b) => b.Confidence)
      .filter((c): c is number => typeof c === 'number')
    const meanConfidence =
      confidences.length > 0
        ? confidences.reduce((sum, c) => sum + c, 0) / confidences.length / 100
        : null

    return {
      text,
      confidence: meanConfidence,
      meta: {
        provider: this.name,
        blockCount: response.Blocks?.length ?? 0,
        lineCount: lines.length,
      },
    }
  }
}
