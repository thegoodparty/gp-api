import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

const ALLOWED_BUCKET_PREFIXES = ['ein-supporting-documents', 'uploads'] as const

const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const

export const GenerateSignedUploadUrlArgsSchema = z.object({
  bucket: z
    .string()
    .min(1)
    .refine(
      (val) => !val.includes('..') && !val.startsWith('/'),
      'Bucket must not contain path traversal',
    )
    .refine(
      (val) =>
        ALLOWED_BUCKET_PREFIXES.some(
          (prefix) => val === prefix || val.startsWith(`${prefix}/`),
        ),
      'Bucket prefix not in allowlist',
    ),
  fileName: z
    .string()
    .min(1)
    .max(255)
    .refine(
      (val) => !val.includes('..') && !val.includes('/') && !val.includes('\\'),
      'File name must not contain path separators',
    ),
  fileType: z.enum(ALLOWED_FILE_TYPES),
})

export class GenerateSignedUploadUrlArgsDto extends createZodDto(
  GenerateSignedUploadUrlArgsSchema,
) {}
