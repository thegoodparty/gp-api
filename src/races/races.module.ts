import { Module } from '@nestjs/common'
import { RacesService } from './races.service'
import { RacesController } from './races.controller'
import { PrismaModule } from 'src/prisma/prisma.module'

@Module({
  controllers: [RacesController],
  providers: [RacesService],
  imports: [PrismaModule],
})
export class RacesModule {}
