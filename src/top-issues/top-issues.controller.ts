import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, Put, UsePipes } from '@nestjs/common';
import { TopIssuesService } from './top-issues.service';
import { CreateTopIssueDto, UpdateTopIssueDto } from './schemas/topIssues.schema';
import { ZodValidationPipe } from 'nestjs-zod';

@Controller('top-issues')
@UsePipes(ZodValidationPipe)
export class TopIssuesController {
  constructor(private readonly topIssuesService: TopIssuesService) {}
  
  @Get()
  listTopIssues() {
    return this.topIssuesService.list();
  }

  @Post()
  async createTopIssue(@Body() body: CreateTopIssueDto) {
    return await this.topIssuesService.create(body);
  }

  @Put(':id')
  async updateTopIssue(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateTopIssueDto
  ) {
    return await this.topIssuesService.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async deleteTopIssue(@Param('id', ParseIntPipe) id: number) {
    await this.topIssuesService.delete(id);

  }
}
