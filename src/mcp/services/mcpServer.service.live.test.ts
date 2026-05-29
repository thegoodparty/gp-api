import { describe, it, expect } from 'vitest'
import jwt from 'jsonwebtoken'
import { TEST_CLERK_ID, useTestService } from '@/test-service'

const service = useTestService()

const MCP_ACCEPT = 'application/json, text/event-stream'

describe('POST /v1/mcp (JSON-RPC over HTTP)', () => {
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
})

describe('agent token (broker-signed)', () => {
  const signAgentToken = (clerkUserId: string) =>
    jwt.sign(
      { act: { sub: 'user_agent_fleet' }, run_id: 'test-run' },
      process.env.AGENT_MCP_TOKEN_SECRET as string,
      {
        issuer: 'gp-broker',
        audience: 'gp-api',
        subject: clerkUserId,
        expiresIn: 120,
      },
    )

  it('happy path: agent token accepted on /v1/mcp and tools/call succeeds', async () => {
    const org = await service.prisma.organization.create({
      data: { slug: 'agent-test-org', ownerId: service.user.id },
    })
    await service.prisma.campaign.create({
      data: {
        userId: service.user.id,
        slug: 'agent-test-campaign',
        details: {},
        organizationSlug: org.slug,
      },
    })

    const res = await service.client.post(
      '/v1/mcp',
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: { name: 'GET_campaigns_mine', arguments: {} },
      },
      {
        headers: {
          Accept: MCP_ACCEPT,
          'x-organization-slug': org.slug,
          Authorization: `Bearer ${signAgentToken(TEST_CLERK_ID)}`,
        },
      },
    )

    expect(res.status).toBe(200)
    expect(res.data.result.isError).toBe(false)

    const toolResult = JSON.parse(res.data.result.content[0].text)
    expect(toolResult).toMatchObject({ slug: 'agent-test-campaign' })
  })

  it('rejected directly on a non-MCP route', async () => {
    const org = await service.prisma.organization.create({
      data: { slug: 'agent-nonmcp-org', ownerId: service.user.id },
    })

    const res = await service.client.get('/v1/campaigns/mine', {
      headers: {
        'x-organization-slug': org.slug,
        Authorization: `Bearer ${signAgentToken(TEST_CLERK_ID)}`,
      },
      validateStatus: () => true,
    })

    expect(res.status).toBe(401)
  })

  it('forged x-mcp-internal-marker is rejected on non-MCP route', async () => {
    const org = await service.prisma.organization.create({
      data: { slug: 'agent-forged-org', ownerId: service.user.id },
    })

    const res = await service.client.get('/v1/campaigns/mine', {
      headers: {
        'x-organization-slug': org.slug,
        Authorization: `Bearer ${signAgentToken(TEST_CLERK_ID)}`,
        'x-mcp-internal-marker': 'guessed',
      },
      validateStatus: () => true,
    })

    expect(res.status).toBe(401)
  })

  it('bad-signature agent token rejected on /v1/mcp', async () => {
    const badToken = jwt.sign({}, 'wrong-secret', {
      issuer: 'gp-broker',
      audience: 'gp-api',
      subject: TEST_CLERK_ID,
      expiresIn: 120,
    })

    const res = await service.client.post(
      '/v1/mcp',
      {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/list',
        params: {},
      },
      {
        headers: {
          Accept: MCP_ACCEPT,
          Authorization: `Bearer ${badToken}`,
        },
        validateStatus: () => true,
      },
    )

    expect(res.status).toBe(401)
  })
})
