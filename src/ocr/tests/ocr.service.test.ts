import { describe, expect, it, vi } from 'vitest'
import { OcrService } from '../ocr.service'

describe('OcrService dispatch', () => {
  const buildSvc = () => {
    const image = { extract: vi.fn() }
    const pdf = { extract: vi.fn() }
    const docx = { extract: vi.fn() }
    const plaintext = { extract: vi.fn() }
    const svc = new OcrService(
      image as never,
      pdf as never,
      docx as never,
      plaintext as never,
    )
    return { svc, image, pdf, docx, plaintext }
  }

  const baseInput = {
    bucket: 'b',
    key: 'k',
    fileName: 'f',
  }

  it('routes image mime types through the image extractor and reports completed', async () => {
    const { svc, image, pdf } = buildSvc()
    image.extract.mockResolvedValue({ text: 't', confidence: 0.9, meta: {} })

    const result = await svc.process({ ...baseInput, mimeType: 'image/jpeg' })

    expect(image.extract).toHaveBeenCalledOnce()
    expect(pdf.extract).not.toHaveBeenCalled()
    expect(result.ocrStatus).toBe('completed')
    expect(result.text).toBe('t')
  })

  it('routes PDFs through the pdf extractor', async () => {
    const { svc, pdf } = buildSvc()
    pdf.extract.mockResolvedValue({ text: 'p', confidence: null, meta: {} })

    const result = await svc.process({
      ...baseInput,
      mimeType: 'application/pdf',
    })

    expect(pdf.extract).toHaveBeenCalledOnce()
    expect(result.ocrStatus).toBe('completed')
  })

  it('routes DOCX through the docx extractor', async () => {
    const { svc, docx } = buildSvc()
    docx.extract.mockResolvedValue({ text: 'd', confidence: null, meta: {} })

    const result = await svc.process({
      ...baseInput,
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })

    expect(docx.extract).toHaveBeenCalledOnce()
    expect(result.ocrStatus).toBe('completed')
  })

  it('routes text/plain through plaintext and reports skipped (no OCR ran)', async () => {
    const { svc, plaintext } = buildSvc()
    plaintext.extract.mockResolvedValue({
      text: 'hello',
      confidence: null,
      meta: {},
    })

    const result = await svc.process({ ...baseInput, mimeType: 'text/plain' })

    expect(plaintext.extract).toHaveBeenCalledOnce()
    expect(result.ocrStatus).toBe('skipped')
  })

  it('rejects unsupported mime types with a BadRequest', async () => {
    const { svc } = buildSvc()
    await expect(
      svc.process({ ...baseInput, mimeType: 'application/zip' }),
    ).rejects.toThrow(/unsupported_mime_type/)
  })
})
