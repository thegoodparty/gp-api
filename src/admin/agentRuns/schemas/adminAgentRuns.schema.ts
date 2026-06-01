import { createZodDto } from 'nestjs-zod'
import { AgentRunsListQuerySchema } from '@goodparty_org/contracts'

export class AdminAgentRunsListQueryDto extends createZodDto(
  AgentRunsListQuerySchema,
) {}

export {
  AgentRunListItemSchema,
  type AgentRunListItem,
  AgentRunDetailSchema,
  type AgentRunDetail,
} from '@goodparty_org/contracts'
