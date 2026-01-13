import { Body, Controller, Logger, Post } from '@nestjs/common'
import { Public } from 'src/authentication/decorators/public.decorator'
import { InngestService } from 'src/inngest/inngest.service'
import { PollAnalysisCompleteEventSchema } from 'src/queue/queue.types'

@Controller('webhooks/polls')
export class PollWebhooksController {
  private readonly logger = new Logger(PollWebhooksController.name)

  constructor(private readonly inngestService: InngestService) {}

  @Post('analysis-complete')
  @Public() // Or use proper webhook authentication
  async handleAnalysisComplete(@Body() body: unknown) {
    this.logger.log('Received poll analysis complete webhook')

    // Validate with Zod
    const event = PollAnalysisCompleteEventSchema.parse({
      type: 'pollAnalysisComplete',
      data: body,
    })

    // Send to Inngest
    await this.inngestService.send('poll/analysis.complete', event.data)

    return { success: true }
  }
}
