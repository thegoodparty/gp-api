import {
  Body,
  Controller,
  Post,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { SynthesizeSpeechResponseSchema } from '@goodparty_org/contracts'
import { SynthesizeSpeechRequestDto } from '../schemas/synthesizeSpeech.schema'
import { TextToSpeechService } from '../services/textToSpeech.service'

@Controller('speech')
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
export class TextToSpeechController {
  constructor(private readonly textToSpeechService: TextToSpeechService) {}

  /**
   * Pure pipe: accepts plain text + render options, returns ordered URLs to
   * cached audio segments. Authentication is enforced by the global
   * SessionGuard, so the only context the speech service needs is the user
   * for rate limiting and audit logging.
   */
  @Post('synthesize')
  @ResponseSchema(SynthesizeSpeechResponseSchema)
  async synthesize(
    @ReqUser() user: User,
    @Body() request: SynthesizeSpeechRequestDto,
  ) {
    return this.textToSpeechService.synthesize({ user, request })
  }
}
