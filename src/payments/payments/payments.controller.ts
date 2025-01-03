import { Controller, Post } from '@nestjs/common'

@Controller('payments')
export class PaymentsController {
  constructor() {}

  @Post('events')
  async handleStripeEvent() {
    // Handle Stripe events here
  }
}
