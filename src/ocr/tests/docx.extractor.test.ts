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

const buildOverflowFieldLenBuffer = (): Buffer => {
  const fileName = Buffer.from('a.xml')
  const nameLen = fileName.length

  const lfh = Buffer.alloc(30 + nameLen)
  lfh.writeUInt32LE(0x04034b50, 0)
  lfh.writeUInt16LE(20, 4)
  fileName.copy(lfh, 30)

  const cd = Buffer.alloc(46 + nameLen)
  cd.writeUInt32LE(0x02014b50, 0)
  cd.writeUInt16LE(20, 4)
  cd.writeUInt16LE(20, 6)
  cd.writeUInt32LE(1024, 24)
  cd.writeUInt16LE(nameLen, 28)
  // extra field length inflated past CD boundary
  cd.writeUInt16LE(0xffff, 30)
  cd.writeUInt16LE(0, 32)
  fileName.copy(cd, 46)

  const cdSize = cd.length
  const cdOffset = lfh.length

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdOffset, 16)

  return Buffer.concat([lfh, cd, eocd])
}

// A valid archive whose EOCD comment happens to contain the EOCD signature.
// The backward scan must skip the in-comment match and find the real record.
const buildCommentWithSignatureBuffer = (): Buffer => {
  const base = buildZipBuffer(1024)
  const comment = Buffer.alloc(34)
  comment.writeUInt32LE(0x06054b50, 0)
  const withComment = Buffer.concat([base, comment])
  withComment.writeUInt16LE(comment.length, base.length - 22 + 20)
  return withComment
}

// Two central-directory entries where the second has a corrupted signature.
// The size walk must reject it rather than stop early on the bad entry.
const buildCorruptSecondEntryBuffer = (): Buffer => {
  const fileName = Buffer.from('a.xml')
  const nameLen = fileName.length

  const lfh = Buffer.alloc(30 + nameLen)
  lfh.writeUInt32LE(0x04034b50, 0)
  lfh.writeUInt16LE(20, 4)
  fileName.copy(lfh, 30)

  const cd1 = Buffer.alloc(46 + nameLen)
  cd1.writeUInt32LE(0x02014b50, 0)
  cd1.writeUInt32LE(1024, 24)
  cd1.writeUInt16LE(nameLen, 28)
  fileName.copy(cd1, 46)

  const cd2 = Buffer.alloc(46)

  const cdSize = cd1.length + cd2.length
  const cdOffset = lfh.length

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(2, 8)
  eocd.writeUInt16LE(2, 10)
  eocd.writeUInt32LE(cdSize, 12)
  eocd.writeUInt32LE(cdOffset, 16)

  return Buffer.concat([lfh, cd1, cd2, eocd])
}

const buildZip64EocdBuffer = (): Buffer => {
  const fileName = Buffer.from('a.xml')
  const nameLen = fileName.length

  const lfh = Buffer.alloc(30 + nameLen)
  lfh.writeUInt32LE(0x04034b50, 0)
  lfh.writeUInt16LE(45, 4)
  fileName.copy(lfh, 30)

  const cd = Buffer.alloc(46 + nameLen)
  cd.writeUInt32LE(0x02014b50, 0)
  cd.writeUInt16LE(45, 4)
  cd.writeUInt16LE(45, 6)
  cd.writeUInt32LE(0xffffffff, 24)
  cd.writeUInt16LE(nameLen, 28)
  fileName.copy(cd, 46)

  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(1, 8)
  eocd.writeUInt16LE(1, 10)
  eocd.writeUInt32LE(0xffffffff, 12)
  eocd.writeUInt32LE(0xffffffff, 16)

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

  it('rejects archives with inflated CD field lengths', async () => {
    const overflow = buildOverflowFieldLenBuffer()
    const { extractor } = buildExtractor(overflow)

    await expect(extractor.extract(input())).rejects.toThrow(
      'attachment_invalid_archive',
    )
  })

  it('rejects a corrupted central-directory entry mid-walk', async () => {
    const corrupt = buildCorruptSecondEntryBuffer()
    const { extractor } = buildExtractor(corrupt)

    await expect(extractor.extract(input())).rejects.toThrow(
      'attachment_invalid_archive',
    )
  })

  it('rejects ZIP64 EOCD archives as unsupported', async () => {
    const zip64 = buildZip64EocdBuffer()
    const { extractor } = buildExtractor(zip64)

    await expect(extractor.extract(input())).rejects.toThrow(
      'attachment_unsupported_format',
    )
  })

  it('rejects entries flagged with ZIP64 size sentinels', async () => {
    const sentinel = buildZipBuffer(0xffffffff)
    const { extractor } = buildExtractor(sentinel)

    await expect(extractor.extract(input())).rejects.toThrow(
      'attachment_unsupported_format',
    )
  })

  it('finds the real EOCD when the comment contains its signature', async () => {
    const tricky = buildCommentWithSignatureBuffer()
    const { extractor } = buildExtractor(tricky)

    const result = await extractor.extract(input())

    expect(result.text).toBe('hello')
  })

  it('passes through to mammoth for a valid small archive', async () => {
    const small = buildZipBuffer(1024)
    const { extractor } = buildExtractor(small)

    const result = await extractor.extract(input())

    expect(result.text).toBe('hello')
    expect(result.meta.extractor).toBe('mammoth')
  })
})
