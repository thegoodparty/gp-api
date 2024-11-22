import { Module } from '@nestjs/common';
import { DeclareController } from './declare.controller';
import { DeclareService } from './declare.service';

@Module({
  controllers: [DeclareController],
  providers: [DeclareService]
})
export class DeclareModule {}
