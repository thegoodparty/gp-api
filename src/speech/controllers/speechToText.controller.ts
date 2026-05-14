import {
  Body,
  Controller,
  Post,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { ElectedOffice, User } from '@prisma/client'
import { TranscribeSessionResponseSchema } from '@goodparty_org/contracts'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { TranscribeSessionRequestDto } from '../schemas/transcribeSession.schema'
import { SpeechToTextService } from '../services/speechToText.service'

@Controller('speech/transcribe')
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
export class SpeechToTextController {
  constructor(private readonly speechToTextService: SpeechToTextService) {}

  @Post('session')
  @UseElectedOffice()
  @ResponseSchema(TranscribeSessionResponseSchema)
  async createSession(
    @ReqUser() user: User,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Body() request: TranscribeSessionRequestDto,
  ) {
    return this.speechToTextService.createSession({
      user,
      electedOffice,
      request,
    })
  }
}
