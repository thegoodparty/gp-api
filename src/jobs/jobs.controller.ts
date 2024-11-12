import {
  Controller,
  Get,
  Param,
  NotFoundException,
  BadGatewayException,
} from '@nestjs/common'
import { JobsService } from './jobs.service'

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async findAll() {
    try {
      return await this.jobsService.findAll()
    } catch (e) {
      throw new BadGatewayException(
        e.message || 'Error occurred while fetching jobs',
      )
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
      throw new BadGatewayException(
        e.message || `Error occurred while fetching job with id ${id}`,
      )
    }
  }
}
