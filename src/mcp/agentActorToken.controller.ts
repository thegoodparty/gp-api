import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseInterceptors,
  UsePipes,
} from '@nestjs/common'
import { ZodValidationPipe, createZodDto } from 'nestjs-zod'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { ZodResponseInterceptor } from '@/shared/interceptors/ZodResponse.interceptor'
import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import { AgentActorTokenService } from './services/agentActorToken.service'
import {
  MintActorTokenInputSchema,
  MintActorTokenOutputSchema,
} from './schemas/mintActorToken.schema'

class MintActorTokenDto extends createZodDto(MintActorTokenInputSchema) {}

@Controller('internal/agent')
@UsePipes(ZodValidationPipe)
@UseInterceptors(ZodResponseInterceptor)
@UseGuards(M2MOnly)
export class AgentActorTokenController {
  constructor(private readonly svc: AgentActorTokenService) {}

  @Post('mint-actor-token')
  @HttpCode(HttpStatus.OK)
  @ResponseSchema(MintActorTokenOutputSchema)
  async mint(@Body() body: MintActorTokenDto) {
    return this.svc.mint(body.ownerClerkId, body.expiresInSeconds)
  }
}
