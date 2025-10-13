import { Module } from '@nestjs/common'
import { PeopleService } from './services/people.service'

@Module({
  imports: [],
  providers: [PeopleService],
  controllers: [],
  exports: [PeopleService],
})
export class PeopleModule {}
