import { Controller, Get, Put, Logger, UsePipes, Param } from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { queryTopIssues } from './dynamo-helpers'

@Controller('polls')
@UsePipes(ZodValidationPipe)
export class PollsController {
  private readonly logger = new Logger(this.constructor.name)

  @Get('/')
  async listPolls() {
    return {}
  }

  @Get('/:pollId')
  async getPoll(@Param('pollId') pollId: string) {
    return {}
  }

  @Get('/:pollId/top-issues')
  async getTopIssues(@Param('pollId') pollId: string) {
    const issues = await queryTopIssues(this.logger, pollId)
    return {
      results: issues,
    }
  }

  @Put('/:pollId/internal/result')
  async submitPollResultData(@Param('pollId') pollId: string) {
    return {}
  }

  @Put('/:pollId/internal/complete')
  async markPollComplete(@Param('pollId') pollId: string) {
    return {}
  }
}
