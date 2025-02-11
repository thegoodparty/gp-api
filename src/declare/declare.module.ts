import { Module } from '@nestjs/common'
import { DeclareController } from './declare.controller'
import { HttpModule } from '@nestjs/axios'
import { DeclareService } from './declare.service'

@Module({
  imports: [HttpModule],
  controllers: [DeclareController],
  providers: [DeclareService],
})
export class DeclareModule {}
