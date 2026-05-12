import { beforeAll, describe, it, expect, vi } from 'vitest'
import { UnauthorizedException } from '@nestjs/common'
import jwt from 'jsonwebtoken'
import {
  AUTH_PROVIDER_TOKEN,
  AuthProvider,
} from '@/authentication/interfaces/auth-provider.interface'
import { useTestService } from '@/test-service'

const service = useTestService()

const MCP_ACCEPT = 'application/json, text/event-stream'

const verifyTestJwt = (token: string): string => {
  const decoded = jwt.verify(token, process.env.AUTH_SECRET!)
  const sub = typeof decoded === 'object' ? decoded.sub : undefined
  if (!sub) throw new UnauthorizedException('Invalid test token')
  return sub
}

describe('POST /v1/mcp (JSON-RPC over HTTP)', () => {
  beforeAll(() => {
    const authProvider = service.app.get<AuthProvider>(AUTH_PROVIDER_TOKEN)
    vi.spyOn(authProvider, 'verifySessionToken').mockImplementation(
      async (token) => ({
        externalUserId: verifyTestJwt(token),
        actor: { sub: process.env.AGENT_FLEET_CLERK_ID! },
      }),
    )
  })

  it('lists registered MCP tools', async () => {
    const res = await service.client.post(
      '/v1/mcp',
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {},
      },
      { headers: { Accept: MCP_ACCEPT } },
    )

    expect(res.status).toBe(200)

    expect(res.data).toStrictEqual({
      id: 1,
      jsonrpc: '2.0',
      result: {
        tools: expect.arrayContaining([
          {
            name: 'GET_campaigns_mine',
            description:
              "Read the calling user's active campaign, including organization and live status. Use this on startup to understand who the user is, what office they are running for, and what state the campaign is in.",
            inputSchema: {
              properties: {},
              type: 'object',
            },
          },
        ]),
      },
    })
  })

  it('invokes a tool via tools/call as the calling user', async () => {
    const org = await service.prisma.organization.create({
      data: { slug: 'mcp-test-org', ownerId: service.user.id },
    })
    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'mcp-test-campaign',
        details: {},
        organizationSlug: org.slug,
      },
    })

    const res = await service.client.post(
      '/v1/mcp',
      {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'GET_campaigns_mine', arguments: {} },
      },
      { headers: { Accept: MCP_ACCEPT, 'x-organization-slug': org.slug } },
    )

    expect(res.status).toBe(200)
    expect(res.data.result.isError).toBe(false)

    expect(res.data).toStrictEqual({
      id: 2,
      jsonrpc: '2.0',
      result: {
        isError: false,
        content: [{ type: 'text', text: expect.any(String) }],
      },
    })
    const toolResult = JSON.parse(res.data.result.content[0].text)

    expect(toolResult).toMatchObject({
      id: 1,
      isPro: false,
      slug: 'mcp-test-campaign',
    })
  })

  it('rejects unauthenticated requests', async () => {
    const res = await service.client.post(
      '/v1/mcp',
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/list',
        params: {},
      },
      { headers: { Accept: MCP_ACCEPT, Authorization: 'Bearer invalid' } },
    )

    expect(res.status).toBe(401)
    expect(res.data).toStrictEqual({
      statusCode: 401,
      message: 'Unauthorized',
    })
  })

  it('rejects sessions without the agent-fleet actor', async () => {
    const authProvider = service.app.get<AuthProvider>(AUTH_PROVIDER_TOKEN)
    vi.spyOn(authProvider, 'verifySessionToken').mockImplementationOnce(
      async (token) => ({ externalUserId: verifyTestJwt(token) }),
    )

    const res = await service.client.post(
      '/v1/mcp',
      {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/list',
        params: {},
      },
      { headers: { Accept: MCP_ACCEPT } },
    )

    expect(res.status).toBe(403)
    expect(res.data).toMatchObject({ statusCode: 403 })
  })
})
