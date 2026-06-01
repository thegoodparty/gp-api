import { Controller, Get, Param, Query, UsePipes } from '@nestjs/common'
import { UserRole } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { Roles } from '@/authentication/decorators/Roles.decorator'
import { ResponseSchema } from '@/shared/decorators/ResponseSchema.decorator'
import { PaginatedResponseSchema } from '@/shared/schemas/PaginatedResponse.schema'
import { AdminAgentRunsService } from './services/adminAgentRuns.service'
import {
  AdminAgentRunsListQueryDto,
  AgentRunDetailSchema,
  AgentRunListItemSchema,
} from './schemas/adminAgentRuns.schema'

@Controller('admin/agent-runs')
@UsePipes(ZodValidationPipe)
export class AdminAgentRunsController {
  constructor(private readonly agentRuns: AdminAgentRunsService) {}

  @Get()
  @Roles(UserRole.admin)
  @ResponseSchema(PaginatedResponseSchema(AgentRunListItemSchema))
  list(@Query() query: AdminAgentRunsListQueryDto) {
    return this.agentRuns.list(query)
  }

  @Get(':runId')
  @Roles(UserRole.admin)
  @ResponseSchema(AgentRunDetailSchema)
  detail(@Param('runId') runId: string) {
    return this.agentRuns.detail(runId)
  }
}
