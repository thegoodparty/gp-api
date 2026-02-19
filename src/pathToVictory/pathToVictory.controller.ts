import {
  Body,
  Controller,
  Get,
  Logger,
  Param,
  ParseIntPipe,
  Put,
  Query,
  BadGatewayException,
  HttpException,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { PathToVictory, UserRole } from '@prisma/client'
import { deepmerge as deepMerge } from 'deepmerge-ts'
import { ZodValidationPipe } from 'nestjs-zod'
import { Roles } from '../authentication/decorators/Roles.decorator'
import { EnqueuePathToVictoryService } from './services/enqueuePathToVictory.service'
import { PathToVictoryService } from './services/pathToVictory.service'
import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import type { PaginatedResults } from '@/shared/types/utility.types'
import { IdParamSchema } from '@/shared/schemas/IdParam.schema'
import { ListPathToVictoryPaginationSchema } from './schemas/ListPathToVictoryPagination.schema'
import { PathToVictorySchema } from './schemas/PathToVictory.schema'
import { UpdatePathToVictoryM2MSchema } from './schemas/UpdatePathToVictoryM2M.schema'

@Controller('path-to-victory')
@UsePipes(ZodValidationPipe)
export class PathToVictoryController {
  private readonly logger = new Logger(PathToVictoryController.name)

  constructor(
    private readonly enqueuePathToVictoryService: EnqueuePathToVictoryService,
    private readonly pathToVictoryService: PathToVictoryService,
  ) {}

  @UseGuards(M2MOnly)
  @Get('list')
  async list(@Query() query: ListPathToVictoryPaginationSchema) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- IDE-only false positive: resolves correctly via tsc/eslint CLI
    const { data, meta }: PaginatedResults<PathToVictory> =
      await this.pathToVictoryService.listPathToVictories(query)
    return {
      data: data.map((p2v) => PathToVictorySchema.parse(p2v)),
      meta,
    }
  }

  @UseGuards(M2MOnly)
  @Get(':id')
  async getById(@Param() { id }: IdParamSchema) {
    const p2v = await this.pathToVictoryService.findUniqueOrThrow({
      where: { id },
    })
    return PathToVictorySchema.parse(p2v)
  }

  @UseGuards(M2MOnly)
  @Put(':id')
  async update(
    @Param() { id }: IdParamSchema,
    @Body() body: UpdatePathToVictoryM2MSchema,
  ) {
    const existing = await this.pathToVictoryService.findUniqueOrThrow({
      where: { id },
    })

    const mergedData = deepMerge((existing.data as object) || {}, body.data)

    const updated = await this.pathToVictoryService.update({
      where: { id },
      data: { data: mergedData },
    })

    return PathToVictorySchema.parse(updated)
  }

  @Roles(UserRole.admin)
  @Get('enqueue/:campaignId')
  async enqueuePathToVictory(
    @Param('campaignId', ParseIntPipe) campaignId: number,
  ) {
    try {
      await this.enqueuePathToVictoryService.enqueuePathToVictory(campaignId)
      return {
        success: true,
        message: `Path to victory calculation for campaign ${campaignId} has been enqueued successfully`,
      }
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(
          `Error at PathToVictoryController enqueuePathToVictory. e.message: ${e.message}`,
          e.stack,
        )

        if (e instanceof HttpException) {
          throw e
        }

        throw new BadGatewayException(
          e.message ||
            `Error occurred while enqueuing path to victory for campaign ${campaignId}`,
        )
      }
    }
  }
}
