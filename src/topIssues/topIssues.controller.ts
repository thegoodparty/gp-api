import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UsePipes,
} from '@nestjs/common'
import { TopIssuesService } from './topIssues.service'
import { CreateTopIssueDto } from './schemas/topIssues.schema'
import { ZodValidationPipe } from 'nestjs-zod'

@Controller('top-issues')
@UsePipes(ZodValidationPipe)
export class TopIssuesController {
  constructor(private readonly topIssuesService: TopIssuesService) {}

  @Get()
  listTopIssues() {
    return this.topIssuesService.list()
  }

  @Post()
  async createTopIssue(@Body() body: CreateTopIssueDto) {
    return await this.topIssuesService.create(body)
  }

  @Put(':id')
  async updateTopIssue(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: CreateTopIssueDto,
  ) {
    return await this.topIssuesService.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTopIssue(@Param('id', ParseIntPipe) id: number) {
    await this.topIssuesService.delete(id)
  }

  @Get('by-location')
  getByLocation(@Query('zip') zip: string) {
    return this.topIssuesService.getByLocation(zip)
  }
}
