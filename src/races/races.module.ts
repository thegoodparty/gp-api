import { Module } from '@nestjs/common'
import { RacesService } from './races.service'
import { RacesController } from './races.controller'

@Module({
  controllers: [RacesController],
  providers: [RacesService],
})
export class RacesModule {}
