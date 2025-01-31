import { Body, Controller, Post } from '@nestjs/common'
import { SubscribeService } from './subscribe.service'
import { SubscribeEmailSchema } from './subscribeEmail.schema'
import { PublicAccess } from 'src/authentication/decorators/PublicAccess.decorator'

@PublicAccess()
@Controller('subscribe')
export class SubscribeController {
  constructor(private readonly subscribeService: SubscribeService) {}

  @Post()
  async subscribeEmail(@Body() body: SubscribeEmailSchema) {
    return this.subscribeService.subscribeEmail(body)
  }
}
