import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
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
  @UseGuards(M2MOnly)
  @ResponseSchema(PaginatedResponseSchema(AgentRunListItemSchema))
  list(@Query() query: AdminAgentRunsListQueryDto) {
    return this.agentRuns.list(query)
  }

  @Get(':runId')
  @UseGuards(M2MOnly)
  @ResponseSchema(AgentRunDetailSchema)
  detail(@Param('runId') runId: string) {
    return this.agentRuns.detail(runId)
  }
}
