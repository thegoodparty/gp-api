import { Injectable } from '@nestjs/common'
import {
  CreateTopIssueDto,
  TopIssueOutputDto,
} from './schemas/topIssues.schema'
import { TopIssue } from '../generated/prisma'
import { createPrismaBase, MODELS } from 'src/prisma/util/prisma.util'
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions'
import { LlmService } from '@/llm/services/llm.service'

@Injectable()
export class TopIssuesService extends createPrismaBase(MODELS.TopIssue) {
  constructor(private readonly llm: LlmService) {
    super()
  }

  async getByLocation(zip: string): Promise<string[]> {
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: 'You are a helpful political assistant.',
      },
      {
        role: 'user',
        content: `Please list only the top three political issues in ${zip} zip code (including city and state), based on what you think they would be, to the best of your ability, without any explanation. Your response should be a string of only the issues separated with commas that I can convert to a javascript array with .split(',') function. each issue should be in Title Case`,
      },
    ]

    try {
      const completion = await this.llm.chatCompletion({
        messages,
        maxTokens: 3000,
        temperature: 0.5,
        topP: 0.1,
      })

      const issues = completion.content.split(',')
      return issues.map((issue) => issue.trim())
    } catch (error) {
      this.logger.error(
        { err: error, zip },
        'AI completion failed in getByLocation',
      )
      return []
    }
  }

  async create(body: CreateTopIssueDto): Promise<TopIssueOutputDto> {
    const { name } = body
    return await this.model.create({
      data: {
        name,
      },
    })
  }

  async update(id: number, body: CreateTopIssueDto): Promise<TopIssue> {
    const { name } = body
    return await this.model.update({
      where: { id },
      data: { name },
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
