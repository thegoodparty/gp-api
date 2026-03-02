import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
  UsePipes,
} from '@nestjs/common'
import { PathToVictory } from '@prisma/client'
import { deepmerge as deepMerge } from 'deepmerge-ts'
import { ZodValidationPipe } from 'nestjs-zod'
import { PathToVictoryService } from './services/pathToVictory.service'
import { M2MOnly } from '@/authentication/guards/M2MOnly.guard'
import type { PaginatedResults } from '@/shared/types/utility.types'
import { IdParamSchema } from '@/shared/schemas/IdParam.schema'
import { ListPathToVictoryPaginationSchema } from './schemas/ListPathToVictoryPagination.schema'
import { PathToVictorySchema } from './schemas/PathToVictory.schema'
import { UpdatePathToVictoryM2MSchema } from './schemas/UpdatePathToVictoryM2M.schema'
import { PinoLogger } from 'nestjs-pino'

@Controller('path-to-victory')
@UseGuards(M2MOnly)
@UsePipes(ZodValidationPipe)
export class PathToVictoryController {
  constructor(
    private readonly pathToVictoryService: PathToVictoryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PathToVictoryController.name)
  }

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

  @Get(':id')
  async getById(@Param() { id }: IdParamSchema) {
    const p2v = await this.pathToVictoryService.findUniqueOrThrow({
      where: { id },
    })
    return PathToVictorySchema.parse(p2v)
  }

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
}
