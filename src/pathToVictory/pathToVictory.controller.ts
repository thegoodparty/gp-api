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
import type { PathToVictoryDataWithLegacy } from './types/pathToVictory.types'

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

    const {
      projectedTurnout: _pt,
      winNumber: _wn,
      voterContactGoal: _vcg,
      electionType: _et,
      electionLocation: _el,
      districtId: _di,
      districtManuallySet: _dms,
      ...cleanedData
    } = body.data as PathToVictoryDataWithLegacy

    const mergedData = deepMerge((existing.data as object) || {}, cleanedData)

    const updated = await this.pathToVictoryService.update({
      where: { id },
      data: { data: mergedData },
    })

    return PathToVictorySchema.parse(updated)
  }
}
