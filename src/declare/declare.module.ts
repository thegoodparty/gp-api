import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { DeclareController } from './declare.controller'
import { DeclareService } from './declare.service'

@Module({
  imports: [HttpModule],
  controllers: [DeclareController],
  providers: [DeclareService],
})
export class DeclareModule {}
