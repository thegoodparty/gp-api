import { createZodDto } from 'nestjs-zod'
import { SynthesizeSpeechRequestSchema } from '@goodparty_org/contracts'

export class SynthesizeSpeechRequestDto extends createZodDto(
  SynthesizeSpeechRequestSchema,
) {}
