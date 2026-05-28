import { describe, expect, it } from 'vitest'
import { GenerateSignedUploadUrlArgsSchema } from './GenerateSignedUploadUrlArgs.schema'

const validPayload = {
  bucket: 'uploads',
  fileName: 'doc.pdf',
  fileType: 'application/pdf' as const,
}

describe('GenerateSignedUploadUrlArgsSchema', () => {
  it('accepts a valid payload', () => {
    const result = GenerateSignedUploadUrlArgsSchema.safeParse(validPayload)
    expect(result.success).toBe(true)
  })

  it('accepts a bucket with subfolder', () => {
    const result = GenerateSignedUploadUrlArgsSchema.safeParse({
      ...validPayload,
      bucket: 'ein-supporting-documents/test-folder',
    })
    expect(result.success).toBe(true)
  })

  describe('bucket validation', () => {
    it('rejects path traversal via ..', () => {
      const result = GenerateSignedUploadUrlArgsSchema.safeParse({
        ...validPayload,
        bucket: 'uploads/../secrets',
      })
      expect(result.success).toBe(false)
    })

    it('rejects leading slash', () => {
      const result = GenerateSignedUploadUrlArgsSchema.safeParse({
        ...validPayload,
        bucket: '/uploads',
      })
      expect(result.success).toBe(false)
    })

    it('rejects bucket not in allowlist', () => {
      const result = GenerateSignedUploadUrlArgsSchema.safeParse({
        ...validPayload,
        bucket: 'arbitrary-bucket',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty bucket', () => {
      const result = GenerateSignedUploadUrlArgsSchema.safeParse({
        ...validPayload,
        bucket: '',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('fileName validation', () => {
    it('rejects path traversal via ..', () => {
      const result = GenerateSignedUploadUrlArgsSchema.safeParse({
        ...validPayload,
        fileName: '../index.html',
      })
      expect(result.success).toBe(false)
    })

    it('rejects forward slash', () => {
      const result = GenerateSignedUploadUrlArgsSchema.safeParse({
        ...validPayload,
        fileName: 'path/to/file.pdf',
      })
      expect(result.success).toBe(false)
    })

    it('rejects backslash', () => {
      const result = GenerateSignedUploadUrlArgsSchema.safeParse({
        ...validPayload,
        fileName: 'path\\file.pdf',
      })
      expect(result.success).toBe(false)
    })

    it('rejects empty fileName', () => {
      const result = GenerateSignedUploadUrlArgsSchema.safeParse({
        ...validPayload,
        fileName: '',
      })
      expect(result.success).toBe(false)
    })
  })

  describe('fileType validation', () => {
    it('rejects text/html', () => {
      const result = GenerateSignedUploadUrlArgsSchema.safeParse({
        ...validPayload,
        fileType: 'text/html',
      })
      expect(result.success).toBe(false)
    })

    it('rejects application/javascript', () => {
      const result = GenerateSignedUploadUrlArgsSchema.safeParse({
        ...validPayload,
        fileType: 'application/javascript',
      })
      expect(result.success).toBe(false)
    })

    it('accepts all allowed MIME types', () => {
      const allowed = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
      ] as const

      for (const fileType of allowed) {
        const result = GenerateSignedUploadUrlArgsSchema.safeParse({
          ...validPayload,
          fileType,
        })
        expect(result.success).toBe(true)
      }
    })
  })
})
