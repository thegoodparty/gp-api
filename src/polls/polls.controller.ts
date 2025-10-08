import { Controller, Get, Put, Logger, UsePipes } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'

@Controller('polls')
@UsePipes(ZodValidationPipe)
export class PollsController {
  logger = new Logger(this.constructor.name)

  constructor() {}

  @Get('/')
  async listPolls() {
    return {}
  }

  @Get('/:pollId')
  async getPoll() {
    return {}
  }

  @Get('/:pollId/top-issues')
  async getTopIssues() {
    return {}
  }

  @Put('/:pollId/internal/result')
  async submitPollResultData() {
    return {}
  }

  @Put('/:pollId/internal/complete')
  async markPollComplete() {
    return {}
  }
}
