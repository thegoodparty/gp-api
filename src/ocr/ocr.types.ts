/**
 * The OCR provider interface — the seam between our extractors and the
 * underlying vendor (AWS Textract today; GCV / Azure tomorrow).
 *
 * Image and scanned-PDF extractors depend only on this interface, never on
 * an AWS SDK type. Swapping providers means writing a new implementation
 * and changing the DI binding in OcrModule.
 */

export interface OcrInput {
  /** S3 bucket holding the file. Providers may read direct from S3. */
  bucket: string
  /** S3 object key. */
  key: string
  /** MIME type for routing or vendor-specific options. */
  mimeType: string
  /** Original file name (for logs / vendor metadata). */
  fileName?: string
}

export interface OcrResult {
  text: string
  /** 0–1 confidence if the provider reports one; null otherwise. */
  confidence: number | null
  /** Provider-specific metadata (page count, block count) for debugging. */
  meta: Record<string, unknown>
}

export interface OcrProvider {
  /** Name used in logs and metrics — e.g. "textract". */
  readonly name: string
  /** True if this provider can handle the given mime type. */
  supports(mimeType: string): boolean
  /**
   * Run OCR on the input. Throws on hard failure; the queue worker is the
   * one that catches and converts the exception into a FAILED row.
   */
  run(input: OcrInput): Promise<OcrResult>
}

/** DI token used by OcrModule providers and consumers. */
export const OCR_PROVIDER = Symbol.for('OcrProvider')
