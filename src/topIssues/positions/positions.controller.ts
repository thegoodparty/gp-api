import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common'
import { ZodValidationPipe } from 'nestjs-zod'
import { PositionsService } from './positions.service'
import { CreatePositionSchema } from './schemas/CreatePosition.schema'
import { UpdatePositionSchema } from './schemas/UpdatePosition.schema'
import { PinoLogger } from 'nestjs-pino'

@Controller('positions')
@UsePipes(ZodValidationPipe)
export class PositionsController {
  constructor(
    private readonly positionsService: PositionsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PositionsController.name)
  }

  @Get()
  list() {
    return this.positionsService.findAll()
  }

  @Post()
  create(@Body() body: CreatePositionSchema) {
    return this.positionsService.create(body)
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePositionSchema,
  ) {
    return this.positionsService.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number) {
    return this.positionsService.delete(id)
  }
}
