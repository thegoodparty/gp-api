import {
  Controller,
  Get,
  Param,
  NotFoundException,
  HttpException,
  BadGatewayException,
  Logger,
} from '@nestjs/common'
import { JobsService } from './jobs.service'
import { PublicAccess } from '../authentication/decorators/public-access.decorator'

@Controller('jobs')
@PublicAccess()
export class JobsController {
  private readonly logger = new Logger(JobsService.name)
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async findAll() {
    try {
      return await this.jobsService.findAll()
    } catch (e) {
      if (e instanceof Error) {
        this.logger.log(
          `Error at jobController findAll. e.message: ${e.message}`,
          e,
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
      const job = await this.jobsService.findOne(id)
      if (!job) {
        throw new NotFoundException(`Job with id ${id} not found`)
      }
      return job
    } catch (e) {
      if (e instanceof Error) {
        this.logger.log(
          `Error at jobController findOne e.message:${e.message}`,
          e,
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
