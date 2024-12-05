import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, UsePipes } from '@nestjs/common';
import { TopIssuesService } from './top-issues.service';
import { CreateTopIssueSchema } from './schemas/topIssues.schema';
import { ZodValidationPipe } from 'nestjs-zod';

@Controller('top-issues')
@UsePipes(ZodValidationPipe)
export class TopIssuesController {
  constructor(private readonly topIssuesService: TopIssuesService) {}
  
  @Get()
  async listTopIssues() {
    const result = await this.topIssuesService.list();

    if (typeof result === 'string') {
      throw new BadRequestException(result);
    }

    return result;
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
  async deleteTopIssue(@Param('id') id: number) {
    const result = await this.topIssuesService.delete(id);

    if (typeof result === 'string') {
      throw new BadRequestException(result);
    }

    return result;
  }
}
