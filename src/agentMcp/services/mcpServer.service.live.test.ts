import 'reflect-metadata'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { NestFactory } from '@nestjs/core'
import { AppModule } from '@/app.module'
import { PrismaService } from '@/prisma/prisma.service'
import { McpServerService } from './mcpServer.service'

describe('McpServerService.gatherTools (live AppModule)', () => {
  beforeAll(() => {
    vi.spyOn(PrismaService.prototype, 'onModuleInit').mockResolvedValue(
      undefined,
    )
    vi.spyOn(PrismaService.prototype, 'onModuleDestroy').mockResolvedValue(
      undefined,
    )
  })

  afterAll(() => {
    vi.restoreAllMocks()
  })

  // If this fails, an @McpTool-decorated route is missing a required schema.
  // Read the error message — it lists which tools and why.
  it('all opted-in tools pass schema validation against the live AppModule', async () => {
    process.env.NODE_ENV = process.env.NODE_ENV ?? 'test'

    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: ['error'],
    })
    await app.init()

    const mcp = app.get(McpServerService)
    expect(() => mcp.getTools()).not.toThrow()

    await app.close()
  }, 60_000)
})
