import { UserRole } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ROLES_KEY } from '@/authentication/decorators/Roles.decorator'
import { MCP_TOOL_KEY } from '@/mcp/decorators/McpTool.decorator'
import { AdminAgentRunsController } from './adminAgentRuns.controller'
import { AdminAgentRunsService } from './services/adminAgentRuns.service'
import { AdminAgentRunsListQueryDto } from './schemas/adminAgentRuns.schema'

const rolesFor = (method: keyof AdminAgentRunsController) =>
  Reflect.getMetadata(ROLES_KEY, AdminAgentRunsController.prototype[method])

const mcpToolFor = (method: keyof AdminAgentRunsController) =>
  Reflect.getMetadata(MCP_TOOL_KEY, AdminAgentRunsController.prototype[method])

describe('AdminAgentRunsController', () => {
  let controller: AdminAgentRunsController
  let service: AdminAgentRunsService

  beforeEach(() => {
    const serviceMock: Partial<AdminAgentRunsService> = {
      list: vi.fn(),
      detail: vi.fn(),
    }
    service = serviceMock as AdminAgentRunsService
    controller = new AdminAgentRunsController(service)
  })

  it('restricts both endpoints to admins', () => {
    expect(rolesFor('list')).toEqual([UserRole.admin])
    expect(rolesFor('detail')).toEqual([UserRole.admin])
  })

  it('does not expose either endpoint as an MCP tool', () => {
    expect(mcpToolFor('list')).toBeUndefined()
    expect(mcpToolFor('detail')).toBeUndefined()
  })

  it('delegates list to the service and returns its paginated result', async () => {
    const paginated = { data: [], meta: { total: 0, offset: 0, limit: 100 } }
    vi.mocked(service.list).mockResolvedValue(paginated)
    const query = { offset: 0, limit: 100 } as AdminAgentRunsListQueryDto

    const result = await controller.list(query)

    expect(service.list).toHaveBeenCalledWith(query)
    expect(result).toBe(paginated)
  })

  it('delegates detail to the service by runId', async () => {
    const detail = {
      run: { runId: 'run-1' },
      artifact: null,
      conversationLog: null,
    }
    // detail's return type is structural; cast the fixture for the mock
    vi.mocked(service.detail).mockResolvedValue(
      detail as Awaited<ReturnType<AdminAgentRunsService['detail']>>,
    )

    const result = await controller.detail('run-1')

    expect(service.detail).toHaveBeenCalledWith('run-1')
    expect(result).toBe(detail)
  })
})
