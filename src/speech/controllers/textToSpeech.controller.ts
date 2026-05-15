import {
  Body,
  Controller,
  Post,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { ElectedOffice, Organization, User } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { ReqElectedOffice } from '@/electedOffice/decorators/ReqElectedOffice.decorator'
import { UseElectedOffice } from '@/electedOffice/decorators/UseElectedOffice.decorator'
import { ReqOrganization } from '@/organizations/decorators/ReqOrganization.decorator'
import { UseOrganization } from '@/organizations/decorators/UseOrganization.decorator'
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

  @Post('synthesize')
  @UseElectedOffice()
  @UseOrganization()
  @ResponseSchema(SynthesizeSpeechResponseSchema)
  async synthesize(
    @ReqUser() user: User,
    @ReqOrganization() organization: Organization,
    @ReqElectedOffice() electedOffice: ElectedOffice,
    @Body() request: SynthesizeSpeechRequestDto,
  ) {
    return this.textToSpeechService.synthesize({
      user,
      organization,
      electedOffice,
      request,
    })
  }
}
