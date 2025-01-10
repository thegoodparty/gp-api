import { Injectable, Logger } from '@nestjs/common'
import {
  CreateTopIssueDto,
  TopIssueOutputDto,
  UpdateTopIssueDto,
} from './schemas/topIssues.schema'
import { PrismaService } from 'src/prisma/prisma.service'
import { TopIssue } from '@prisma/client'

@Injectable()
export class TopIssuesService {
  private readonly logger = new Logger(TopIssuesService.name)
  constructor(private prismaService: PrismaService) {}

  async create(body: CreateTopIssueDto): Promise<TopIssueOutputDto> {
    const { name, icon } = body
    return await this.prismaService.topIssue.create({
      data: {
        name,
        icon,
      },
    })
  }

  async update(id: number, body: UpdateTopIssueDto): Promise<TopIssue> {
    const { name, icon } = body
    return await this.prismaService.topIssue.update({
      where: { id },
      data: { name, icon },
    })
  }

  async delete(id: number): Promise<void> {
    await this.prismaService.topIssue.delete({
      where: { id },
    })
  }

  async list(): Promise<TopIssue[]> {
    return await this.prismaService.topIssue.findMany({
      include: {
        positions: {
          orderBy: {
            name: 'asc',
          },
        },
      },
    })
  }
}
