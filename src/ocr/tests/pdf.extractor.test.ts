import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { PdfOcrExtractor } from '../extractors/pdf.extractor'

const mockGetText = vi.fn()
const mockDestroy = vi.fn()

vi.mock('pdf-parse', () => {
  class MockPDFParse {
    getText = mockGetText
    destroy = mockDestroy
  }
  return { PDFParse: MockPDFParse }
})

const PDF_MIME = 'application/pdf'

const buildExtractor = (getFileBytesReturn: Buffer | undefined) => {
  const s3 = {
    getFileBytes: vi.fn().mockResolvedValue(getFileBytesReturn),
  }
  const extractor = new PdfOcrExtractor(s3 as never)
  return { extractor, s3 }
}

const input = () => ({
  bucket: 'b',
  key: 'k',
  mimeType: PDF_MIME,
})

describe('PdfOcrExtractor', () => {
  it('throws NotFoundException when S3 object is missing', async () => {
    const { extractor } = buildExtractor(undefined)

    await expect(extractor.extract(input())).rejects.toThrow(NotFoundException)
  })

  it('throws BadRequestException when buffer exceeds 20 MB', async () => {
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1)
    const { extractor } = buildExtractor(oversized)

    await expect(extractor.extract(input())).rejects.toThrow(
      BadRequestException,
    )
  })

  it('returns extracted text for a valid PDF buffer', async () => {
    mockGetText.mockResolvedValue({ text: 'page content', total: 3 })
    mockDestroy.mockResolvedValue(undefined)
    const { extractor } = buildExtractor(Buffer.from('fake-pdf'))

    const result = await extractor.extract(input())

    expect(result.text).toBe('page content')
    expect(result.meta.extractor).toBe('pdf-parse')
    expect(result.meta.pages).toBe(3)
    expect(mockDestroy).toHaveBeenCalled()
  })
})
