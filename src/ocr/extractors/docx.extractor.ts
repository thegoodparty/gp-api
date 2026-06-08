import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import mammoth from 'mammoth'
import { S3Service } from '@/vendors/aws/services/s3.service'
import { OcrInput, OcrResult } from '../ocr.types'

const MAX_BUFFER_BYTES = 20 * 1024 * 1024
const MAX_DECOMPRESSED_BYTES = 100 * 1024 * 1024

const EOCD_SIGNATURE = 0x06054b50
const CD_ENTRY_SIGNATURE = 0x02014b50
const EOCD_MIN_SIZE = 22
const ZIP64_SENTINEL = 0xffffffff

const findEocdOffset = (buf: Buffer): number => {
  for (
    let i = buf.length - EOCD_MIN_SIZE;
    i >= Math.max(0, buf.length - 65557);
    i--
  ) {
    if (buf.readUInt32LE(i) !== EOCD_SIGNATURE) continue
    // Disambiguate the real EOCD from the signature appearing inside an
    // archive comment: only the true record's comment-length field accounts
    // for exactly the bytes remaining after it.
    const commentLen = buf.readUInt16LE(i + 20)
    if (i + EOCD_MIN_SIZE + commentLen === buf.length) return i
  }
  return -1
}

const totalUncompressedSize = (buf: Buffer): number => {
  const eocd = findEocdOffset(buf)
  if (eocd < 0) {
    throw new BadRequestException('attachment_invalid_archive')
  }

  const cdOffset = buf.readUInt32LE(eocd + 16)
  const cdSize = buf.readUInt32LE(eocd + 12)
  if (cdOffset === ZIP64_SENTINEL || cdSize === ZIP64_SENTINEL) {
    throw new BadRequestException('attachment_unsupported_format')
  }
  if (cdOffset + cdSize > buf.length || cdOffset > buf.length) {
    throw new BadRequestException('attachment_invalid_archive')
  }

  let total = 0
  let pos = cdOffset
  const cdEnd = cdOffset + cdSize
  while (pos + 46 <= cdEnd) {
    if (buf.readUInt32LE(pos) !== CD_ENTRY_SIGNATURE) {
      throw new BadRequestException('attachment_invalid_archive')
    }
    const uncompressed = buf.readUInt32LE(pos + 24)
    if (uncompressed === ZIP64_SENTINEL) {
      throw new BadRequestException('attachment_unsupported_format')
    }
    total += uncompressed
    if (total > MAX_DECOMPRESSED_BYTES) return total

    const nameLen = buf.readUInt16LE(pos + 28)
    const extraLen = buf.readUInt16LE(pos + 30)
    const commentLen = buf.readUInt16LE(pos + 32)
    const next = pos + 46 + nameLen + extraLen + commentLen
    if (next > cdEnd) {
      throw new BadRequestException('attachment_invalid_archive')
    }
    pos = next
  }

  return total
}

/**
 * DOCX extraction via mammoth. No OCR needed — the bytes are the text.
 */
@Injectable()
export class DocxOcrExtractor {
  constructor(private readonly s3: S3Service) {}

  async extract(input: OcrInput): Promise<OcrResult> {
    const bytes = await this.s3.getFileBytes(input.bucket, input.key)
    if (!bytes) {
      throw new NotFoundException('attachment_object_missing')
    }
    if (bytes.length > MAX_BUFFER_BYTES) {
      throw new BadRequestException('attachment_too_large')
    }

    const decompressedTotal = totalUncompressedSize(bytes)
    if (decompressedTotal > MAX_DECOMPRESSED_BYTES) {
      throw new BadRequestException('attachment_decompressed_size_exceeded')
    }

    const result = await mammoth.extractRawText({
      buffer: bytes,
    })
    return {
      text: (result.value ?? '').trim(),
      confidence: null,
      meta: {
        extractor: 'mammoth',
        warnings: result.messages?.length ?? 0,
      },
    }
  }
}
