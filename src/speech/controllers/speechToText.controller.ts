import {
  Body,
  Controller,
  Post,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { User } from '../../generated/prisma'
import { TranscribeSessionResponseSchema } from '@goodparty_org/contracts'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { TranscribeSessionRequestDto } from '../schemas/transcribeSession.schema'
import { SpeechToTextService } from '../services/speechToText.service'

@Controller('speech/transcribe')
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
export class SpeechToTextController {
  constructor(private readonly speechToTextService: SpeechToTextService) {}

  /**
   * Pure pipe: mints a short-lived ticket the client can use to open a
   * WebSocket. The transcript stream returned over that socket is the only
   * output — persisting the resulting text to a note (or anywhere else) is
   * the caller's responsibility against whichever domain API owns it.
   *
   * The body parameter is reserved for future server-influencing options
   * (language hint, partial cadence). It is intentionally empty today and
   * still accepted via Body to allow forward-compatible additions without
   * a breaking change.
   */
  @Post('session')
  @ResponseSchema(TranscribeSessionResponseSchema)
  createSession(
    @ReqUser() user: User,
    @Body() _request: TranscribeSessionRequestDto,
  ) {
    return this.speechToTextService.createSession({ user })
  }
}
