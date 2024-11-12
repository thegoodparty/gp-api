import {
  Controller,
  Get,
  Param,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common'
import { JobsService } from './jobs.service'

@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get()
  async findAll() {
    const jobs = await this.jobsService.findAll()
    if (!jobs) {
      throw new InternalServerErrorException(
        `Error occurred while fetching jobs`,
      )
    }
    return jobs
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const job = await this.jobsService.findOne(id)
    if (!job) {
      throw new NotFoundException(`Job with id ${id} not found`)
    }
    return job
  }
}
