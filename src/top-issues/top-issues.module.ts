import { Module } from '@nestjs/common';
import { TopIssuesController } from './top-issues.controller';
import { TopIssuesService } from './top-issues.service';

@Module({
  controllers: [TopIssuesController],
  providers: [TopIssuesService]
})
export class TopIssuesModule {}
