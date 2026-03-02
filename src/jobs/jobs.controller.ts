import {
  Controller,
  Get,
  Param,
  NotFoundException,
  HttpException,
  BadGatewayException,
} from '@nestjs/common'
import { JobsService } from './jobs.service'
import { PublicAccess } from '../authentication/decorators/PublicAccess.decorator'
import { PinoLogger } from 'nestjs-pino'

@Controller('jobs')
@PublicAccess()
export class JobsController {
  constructor(
    private readonly jobsService: JobsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(JobsService.name)
  }

  @Get()
  async findAll() {
    try {
      return await this.jobsService.findAll()
    } catch (e) {
      if (e instanceof Error) {
        this.logger.info(
          e,
          `Error at jobController findAll. e.message: ${e.message}`,
        )
        throw new BadGatewayException(
          e.message || 'Error occurred while fetching jobs',
        )
      }
    }
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    try {
      const job = (await this.jobsService.findOne(id)) as Record<
        string,
        string | number | boolean
      > | null
      if (!job) {
        throw new NotFoundException(`Job with id ${id} not found`)
      }
      return job
    } catch (e) {
      if (e instanceof Error) {
        this.logger.info(
          e,
          `Error at jobController findOne e.message:${e.message}`,
        )
        if (e instanceof HttpException) {
          throw e
        }
        throw new BadGatewayException(
          e.message || `Error occurred while fetching job with id ${id}`,
        )
      }
    }
  }
}
