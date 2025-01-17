import { createZodDto } from 'nestjs-zod'
import { z } from 'zod'

export const GenerateSignedUploadUrlArgsSchema = z.object({
  fileType: z.string(),
  fileName: z.string(),
  bucket: z.string(),
})

export class GenerateSignedUploadUrlArgsDto extends createZodDto(
  GenerateSignedUploadUrlArgsSchema,
) {}
