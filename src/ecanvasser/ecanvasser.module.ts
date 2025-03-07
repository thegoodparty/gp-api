import { Module } from '@nestjs/common'
import { EcanvasserController } from './ecanvasser.controller'
import { EcanvasserService } from './ecanvasser.service'
import { HttpModule } from '@nestjs/axios'

@Module({
  imports: [HttpModule],
  controllers: [EcanvasserController],
  providers: [EcanvasserService],
  exports: [EcanvasserService],
})
export class EcanvasserModule {}
