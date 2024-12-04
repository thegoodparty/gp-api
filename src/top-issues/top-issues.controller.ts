import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, UsePipes } from '@nestjs/common';
import { TopIssuesService } from './top-issues.service';
import { CreateTopIssueSchema } from './schemas/topIssues.schema';
import { ZodValidationPipe } from 'nestjs-zod';

@Controller('top-issues')
@UsePipes(ZodValidationPipe)
export class TopIssuesController {
  constructor(private readonly topIssuesService: TopIssuesService) {}
  
  @Get()
  listTopIssues() {

  }

  @Post()
  async createTopIssue(@Body() body: CreateTopIssueSchema) {
    const result = await this.topIssuesService.create(body);

    if (typeof result === 'string') {
      throw new BadRequestException(result);
    }

    return result;
  }

  @Put(':id')
  updateTopIssue(@Param('id') id: number, @Body() updateTopIssueDto: any) {

  }

  @Delete(':id')
  deleteTopIssue(@Param('id') id: number) {

  }
}
