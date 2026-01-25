import { All, Controller, Req, Res, Logger } from '@nestjs/common'
import { FastifyRequest, FastifyReply } from 'fastify'
import { serve } from 'inngest/fastify'
import { inngest } from './inngest.client'
import { InngestFunctionsService } from './services/inngestFunctions.service'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'

@Controller('inngest')
export class InngestController {
  private readonly logger = new Logger(InngestController.name)
  private handler: ReturnType<typeof serve>

  constructor(
    private readonly inngestFunctionsService: InngestFunctionsService,
  ) {
    this.handler = serve({
      client: inngest,
      functions: this.inngestFunctionsService.getFunctions(),
    })
  }

  @PublicAccess()
  @All()
  async handleInngest(@Req() req: FastifyRequest, @Res() res: FastifyReply) {
    this.logger.debug(`Inngest request: ${req.method} ${req.url}`)
    return this.handler(
      req as Parameters<typeof this.handler>[0],
      res as Parameters<typeof this.handler>[1],
    )
  }
}
