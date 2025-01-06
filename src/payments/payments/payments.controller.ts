import { Controller, Post, RawBody, Headers } from '@nestjs/common'
import { PublicAccess } from '../../authentication/decorators/PublicAccess.decorator'

@Controller('payments')
export class PaymentsController {
  constructor() {}

  @Post('events')
  @PublicAccess()
  async handleStripeEvent(
    @RawBody() rawBody: Buffer,
    @Headers() headers: Record<string, string>,
  ) {
    console.log(`headers =>`, headers)
    return 'ok'
    // Handle Stripe events here
  }
}
