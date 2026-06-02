import { BadRequestException, NotFoundException } from '@nestjs/common'
import { describe, expect, it, vi } from 'vitest'
import { DocxOcrExtractor } from '../extractors/docx.extractor'

vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({ value: 'hello', messages: [] }),
  },
}))

const buildExtractor = (getFileBytesReturn: Buffer | undefined) => {
  const s3 = {
    getFileBytes: vi.fn().mockResolvedValue(getFileBytesReturn),
  }
  const extractor = new DocxOcrExtractor(s3 as never)
  return { extractor, s3 }
}

/**
 * Builds a minimal ZIP buffer with one entry whose central-directory
 * header advertises the given uncompressed size. The actual payload
 * is empty -- we only need the CD metadata for the size check.
 */
const buildZipBuffer = (uncompressedSize: number): Buffer => {
  const fileName = Buffer.from('a.xml')
  const nameLen = fileName.length

  // Local file header (30 + nameLen bytes)
  const lfh = Buffer.alloc(30 + nameLen)
  lfh.writeUInt32LE(0x04034b50, 0) // signature
  lfh.writeUInt16LE(20, 4) // version needed
  lfh.writeUInt16LE(0, 6) // flags
  lfh.writeUInt16LE(0, 8) // compression: stored
  lfh.writeUInt32LE(0, 14) // crc32
  lfh.writeUInt32LE(0, 18) // compressed size
  lfh.writeUInt32LE(uncompressedSize, 22) // uncompressed size
  lfh.writeUInt16LE(nameLen, 26) // name length
  lfh.writeUInt16LE(0, 28) // extra length
  fileName.copy(lfh, 30)

  const lfhSize = lfh.length

  // Central directory entry (46 + nameLen bytes)
  const cd = Buffer.alloc(46 + nameLen)
  cd.writeUInt32LE(0x02014b50, 0) // signature
  cd.writeUInt16LE(20, 4) // version made by
  cd.writeUInt16LE(20, 6) // version needed
  cd.writeUInt16LE(0, 8) // flags
  cd.writeUInt16LE(0, 10) // compression
  cd.writeUInt32LE(0, 16) // crc32
  cd.writeUInt32LE(0, 20) // compressed size
  cd.writeUInt32LE(uncompressedSize, 24) // uncompressed size
  cd.writeUInt16LE(nameLen, 28) // name length
  cd.writeUInt16LE(0, 30) // extra length
  cd.writeUInt16LE(0, 32) // comment length
  cd.writeUInt32LE(0, 42) // local header offset
  fileName.copy(cd, 46)

  const cdSize = cd.length
  const cdOffset = lfhSize

  // End of central directory (22 bytes)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // signature
  eocd.writeUInt16LE(0, 4) // disk number
  eocd.writeUInt16LE(0, 6) // disk with CD
  eocd.writeUInt16LE(1, 8) // entries on disk
  eocd.writeUInt16LE(1, 10) // total entries
  eocd.writeUInt32LE(cdSize, 12) // CD size
  eocd.writeUInt32LE(cdOffset, 16) // CD offset
  eocd.writeUInt16LE(0, 20) // comment length

  return Buffer.concat([lfh, cd, eocd])
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const input = (
  overrides?: Partial<Parameters<DocxOcrExtractor['extract']>[0]>,
) => ({
  bucket: 'b',
  key: 'k',
  mimeType: DOCX_MIME,
  ...overrides,
})

describe('DocxOcrExtractor', () => {
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

  it('throws BadRequestException when buffer is not a valid ZIP', async () => {
    const notZip = Buffer.from('not a zip file at all')
    const { extractor } = buildExtractor(notZip)

    await expect(extractor.extract(input())).rejects.toThrow(
      'attachment_invalid_archive',
    )
  })

  it('throws BadRequestException when decompressed size exceeds limit', async () => {
    const zipBomb = buildZipBuffer(200 * 1024 * 1024)
    const { extractor } = buildExtractor(zipBomb)

    await expect(extractor.extract(input())).rejects.toThrow(
      'attachment_decompressed_size_exceeded',
    )
  })

  it('passes through to mammoth for a valid small archive', async () => {
    const small = buildZipBuffer(1024)
    const { extractor } = buildExtractor(small)

    const result = await extractor.extract(input())

    expect(result.text).toBe('hello')
    expect(result.meta.extractor).toBe('mammoth')
  })
})
