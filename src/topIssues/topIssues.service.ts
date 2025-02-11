import { Injectable } from '@nestjs/common'
import {
  CreateTopIssueDto,
  TopIssueOutputDto,
} from './schemas/topIssues.schema'
import { TopIssue } from '@prisma/client'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { AiService } from 'src/ai/ai.service'
import { AiChatMessage } from 'src/campaigns/ai/chat/aiChat.types'

@Injectable()
export class TopIssuesService extends createPrismaBase(MODELS.TopIssue) {
  constructor(private readonly ai: AiService) {
    super()
  }

  async getByLocation(zip: string): Promise<TopIssue[]> {
    const messages: AiChatMessage[] = [
      {
        role: 'system',
        content: 'You are a helpful political assistant.',
      },
      {
        role: 'user',
        content: `Please list only the top three political issues in ${zip} zip code (including city and state), based on what you think they would be, to the best of your ability, without any explanation. Your response should be a string of only the issues separated with commas that I can convert to a javascript array with .split(',') function. each issue should be in Title Case`,
      },
    ]

    const completion = await this.ai.llmChatCompletion(messages, 3000, 0.5, 0.1)

    const chatResponse = completion.content
    const issues = chatResponse.split(',')
    return issues.map((issue) => issue.trim())
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

  async update(id: number, body: CreateTopIssueDto): Promise<TopIssue> {
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
