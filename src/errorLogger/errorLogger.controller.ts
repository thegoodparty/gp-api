import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { SlackService } from '../shared/services/slack.service'

type FrontEndError = {
  message: string
  url: string
  userEmail: string
  userAgent: string
}

@Controller('error-logger')
export class ErrorLoggerController {
  constructor(private readonly slack: SlackService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async logError(@Body() error: FrontEndError) {
    return await this.slack.errorMessage({
      message: 'Front End error log',
      error,
    })
  }
}
