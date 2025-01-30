import { Injectable } from '@nestjs/common'
import {
  CreateTopIssueDto,
  TopIssueOutputDto,
  UpdateTopIssueDto,
} from './schemas/topIssues.schema'
import { TopIssue } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'

@Injectable()
export class TopIssuesService extends createPrismaBase(MODELS.TopIssue) {
  constructor() {
    super()
  }

  async create(body: CreateTopIssueDto): Promise<TopIssueOutputDto> {
    const { name, icon } = body
    return await this.model.create({
      data: {
        name,
        icon,
      },
    })
  }

  async update(id: number, body: UpdateTopIssueDto): Promise<TopIssue> {
    const { name, icon } = body
    return await this.model.update({
      where: { id },
      data: { name, icon },
    })
  }

  async delete(id: number): Promise<void> {
    await this.model.delete({
      where: { id },
    })
  }

  async list(): Promise<TopIssue[]> {
    return await this.model.findMany({
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
