import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Req,
  Res,
  UsePipes,
} from '@nestjs/common'
import { User } from '@prisma/client'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from 'src/authentication/decorators/ReqUser.decorator'
import { ReqCampaign } from 'src/campaigns/decorators/ReqCampaign.decorator'
import { UseCampaign } from 'src/campaigns/decorators/UseCampaign.decorator'
import { AiChatFeedbackSchema } from './schemas/AiChatFeedback.schema'
import { UpdateAiChatSchema } from './schemas/UpdateAiChat.schema'
import { CreateAiChatSchema } from './schemas/CreateAiChat.schema'
import { StreamAiChatSchema } from './schemas/StreamAiChat.schema'
import { AiChatService } from './aiChat.service'
import { CampaignChatChunk } from './aiChat.types'
import { CampaignsService } from 'src/campaigns/services/campaigns.service'
import { SlackService } from 'src/vendors/slack/services/slack.service'
import { PromptReplaceCampaign } from 'src/ai/services/promptReplace.service'
import { RaceTargetMetrics } from 'src/elections/types/elections.types'
import { PinoLogger } from 'nestjs-pino'

const SSE_HEADERS: Record<string, string> = {
  'content-type': 'text/event-stream',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
}

const STREAM_TIMEOUT_MS = 300_000

// A server-side timeout is NOT a user cancellation: it must use a surfaced,
// retryable code. The client intentionally swallows `aborted` (user pressed
// Stop), so a timeout marked `aborted` would silently show no error/retry.
const TIMEOUT_ERROR_CHUNK = `data: ${JSON.stringify({
  type: 'error',
  code: 'upstream_unavailable',
  message: 'Response took too long. Please try again.',
  retryable: true,
})}\n\n`

// `retryable: false` matches the service's classification of an unclassified
// internal error (AiChatService.streamError defaults `internal` to false), so
// the client gets a consistent signal regardless of where the failure surfaces.
const INTERNAL_ERROR_CHUNK = `data: ${JSON.stringify({
  type: 'error',
  code: 'internal',
  message: 'Chat stream failed.',
  retryable: false,
})}\n\n`

const formatChunk = (chunk: CampaignChatChunk): string =>
  `data: ${JSON.stringify(chunk)}\n\n`

interface DrainableStream {
  once?: (event: string, cb: () => void) => void
  off?: (event: string, cb: () => void) => void
}

// Resolves 'drained' when the socket is writable again, or 'closed' when it
// terminated (close/error/abort). Callers must stop writing on 'closed' — a
// terminal event can arrive before the abort signal flips, so resolving them
// the same way would let the loop write to a destroyed socket.
const waitForDrain = (
  stream: DrainableStream,
  signal: AbortSignal,
): Promise<'drained' | 'closed'> =>
  new Promise<'drained' | 'closed'>((resolve) => {
    if (typeof stream.once !== 'function') {
      resolve('drained')
      return
    }
    const cleanup = () => {
      stream.off?.('drain', onDrain)
      stream.off?.('close', onTerminal)
      stream.off?.('error', onTerminal)
      signal.removeEventListener('abort', onTerminal)
    }
    const onDrain = () => {
      cleanup()
      resolve('drained')
    }
    const onTerminal = () => {
      cleanup()
      resolve('closed')
    }
    stream.once('drain', onDrain)
    stream.once('close', onTerminal)
    stream.once('error', onTerminal)
    if (signal.aborted) {
      onTerminal()
      return
    }
    signal.addEventListener('abort', onTerminal, { once: true })
  })

@Controller('campaigns/ai/chat')
@UsePipes(ZodValidationPipe)
export class AiChatController {
  constructor(
    private aiChatService: AiChatService,
    private campaigns: CampaignsService,
    private slack: SlackService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AiChatController.name)
  }

  @Get()
  async list(@ReqUser() { id: userId }: User) {
    const aiChats = await this.aiChatService.findMany({ where: { userId } })

    const chats: { threadId: string; updatedAt: Date; name: string }[] = []
    for (const chat of aiChats) {
      if (!chat.threadId) continue
      const chatData = chat.data
      chats.push({
        threadId: chat.threadId,
        updatedAt: chat.updatedAt,
        name: chatData.messages?.length > 0 ? chatData.messages[0].content : '',
      })
    }

    return { chats }
  }

  @Get(':threadId')
  async get(
    @ReqUser() { id: userId }: User,
    @Param('threadId') threadId: string,
  ) {
    const aiChat = await this.aiChatService.findUniqueOrThrow({
      where: { threadId, userId },
    })
    const chatData = aiChat.data

    return {
      chat: chatData.messages,
      feedback: chatData.feedback,
    }
  }

  @Post()
  @UseCampaign({
    include: {
      campaignPositions: {
        include: {
          topIssue: true,
          position: true,
        },
      },
      campaignUpdateHistory: true,
      user: true,
    },
  })
  async create(
    @ReqCampaign() campaign: PromptReplaceCampaign,
    @Body() body: CreateAiChatSchema,
  ) {
    try {
      const liveMetrics =
        await this.campaigns.fetchLiveRaceTargetMetrics(campaign)
      return await this.aiChatService.create(campaign, body, liveMetrics)
    } catch (error) {
      this.logger.error({ e: error }, 'Error generating AI chat')
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error,
      })
      this.logApiErrorData(error)
      throw error
    }
  }

  @Put(':threadId')
  @UseCampaign({
    include: {
      campaignPositions: {
        include: {
          topIssue: true,
          position: true,
        },
      },
      campaignUpdateHistory: true,
      user: true,
    },
  })
  async update(
    @ReqCampaign() campaign: PromptReplaceCampaign,
    @Param('threadId') threadId: string,
    @Body() body: UpdateAiChatSchema,
  ) {
    try {
      const liveMetrics =
        await this.campaigns.fetchLiveRaceTargetMetrics(campaign)
      return await this.aiChatService.update(
        threadId,
        campaign,
        body,
        liveMetrics,
      )
    } catch (error) {
      this.logger.error({ e: error }, 'Error generating AI chat')
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error,
      })
      this.logApiErrorData(error)
      throw error
    }
  }

  @Post('stream')
  @UseCampaign({
    include: {
      campaignPositions: {
        include: {
          topIssue: true,
          position: true,
        },
      },
      campaignUpdateHistory: true,
      user: true,
    },
  })
  async stream(
    @ReqCampaign() campaign: PromptReplaceCampaign,
    @Body() body: StreamAiChatSchema,
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    const abortController = new AbortController()
    const onClose = () => abortController.abort()
    req.raw.once('close', onClose)
    let timedOut = false
    const timeout = setTimeout(() => {
      timedOut = true
      abortController.abort()
    }, STREAM_TIMEOUT_MS)

    // writeHead can throw if the client disconnected between the close-listener
    // setup and here (write to a destroyed socket). Clean up the timer + close
    // listener explicitly, since the cleanup `finally` below this point would
    // otherwise be skipped.
    try {
      reply.raw.writeHead(HttpStatus.OK, SSE_HEADERS)
    } catch (err) {
      clearTimeout(timeout)
      req.raw.off('close', onClose)
      this.logger.error({ e: err }, 'failed to write SSE headers')
      return
    }

    let liveMetrics: RaceTargetMetrics | null = null
    try {
      liveMetrics = await this.campaigns.fetchLiveRaceTargetMetrics(campaign)
    } catch (err) {
      this.logger.error(
        { e: err },
        'failed to fetch live race metrics for chat stream',
      )
      liveMetrics = null
    }

    const iterable = this.aiChatService.streamChat(
      campaign,
      body,
      liveMetrics,
      abortController.signal,
    )

    let errored = false
    let doneWritten = false
    try {
      for await (const chunk of iterable) {
        if (abortController.signal.aborted) break
        const flushed: boolean = reply.raw.write(formatChunk(chunk))
        if (chunk.type === 'done') doneWritten = true
        if (!flushed) {
          const drainResult = await waitForDrain(
            reply.raw,
            abortController.signal,
          )
          if (drainResult === 'closed') break
        }
      }
    } catch (err) {
      errored = true
      this.logger.error({ e: err }, 'campaign chat SSE stream failed')
    } finally {
      clearTimeout(timeout)
      req.raw.off('close', onClose)
      // Suppress the timeout chunk if a `done` already went out — the timer can
      // fire between writing `done` and the loop exhausting, which would append
      // a contradictory error after a successful completion.
      if (timedOut && !doneWritten) {
        try {
          reply.raw.write(TIMEOUT_ERROR_CHUNK)
        } catch (err) {
          this.logger.warn({ e: err }, 'failed to write timeout chunk')
        }
      } else if (errored) {
        try {
          reply.raw.write(INTERNAL_ERROR_CHUNK)
        } catch (err) {
          this.logger.warn({ e: err }, 'failed to write error chunk')
        }
      }
      try {
        reply.raw.end()
      } catch (err) {
        this.logger.warn({ e: err }, 'failed to end SSE response')
      }
    }
  }

  @Delete(':threadId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @ReqUser() { id: userId }: User,
    @Param('threadId') threadId: string,
  ) {
    try {
      return await this.aiChatService.delete(threadId, userId)
    } catch (e) {
      this.logger.error({ e }, 'Error at ai/chat/delete')
      throw e
    }
  }

  @Post(':threadId/feedback')
  @HttpCode(HttpStatus.NO_CONTENT)
  async feedback(
    @ReqUser() user: User,
    @Param('threadId') threadId: string,
    @Body() body: AiChatFeedbackSchema,
  ) {
    try {
      return await this.aiChatService.feedback(user, threadId, body)
    } catch (error) {
      this.logger.error({ e: error }, 'Error giving AI chat feedback')
      await this.slack.errorMessage({
        message: 'Error generating AI chat',
        error,
      })
      this.logApiErrorData(error)
      throw error
    }
  }

  private logApiErrorData(error: unknown) {
    if (error == null || typeof error !== 'object') return
    if (
      !('data' in error) ||
      error.data == null ||
      typeof error.data !== 'object'
    )
      return
    if (!('error' in error.data) || typeof error.data.error !== 'string') return
    this.logger.error({ error: error.data.error }, '*** error*** :')
  }
}
