import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, UsePipes } from '@nestjs/common';
import { TopIssuesService } from './top-issues.service';
import { CreateTopIssueDto, CreateTopIssueSchema, DeleteTopIssueDto, UpdateTopIssueDto, UpdateTopIssueSchema } from './schemas/topIssues.schema';
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
  async createTopIssue(@Body() body: CreateTopIssueDto) {
    const result = await this.topIssuesService.create(body);

    if (typeof result === 'string') {
      throw new BadRequestException(result);
    }

    return result;
  }

  @Put(':id')
  async updateTopIssue(@Body() body: UpdateTopIssueDto) {
    const result = await this.topIssuesService.update(body);

    if (typeof result === 'string') {
      throw new BadRequestException(result);
    }

    return result;
  }

  @Delete(':id')
  async deleteTopIssue(@Param('id') param: DeleteTopIssueDto) {
    const result = await this.topIssuesService.delete(param);

    if (typeof result === 'string') {
      throw new BadRequestException(result);
    }

    return result;
  }
}
