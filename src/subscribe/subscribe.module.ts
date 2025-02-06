import { Module } from '@nestjs/common'
import { SubscribeService } from './subscribe.service'
import { SubscribeController } from './subscribe.controller'
import { UsersModule } from '../users/users.module'

@Module({
  imports: [UsersModule],
  controllers: [SubscribeController],
  providers: [SubscribeService],
  exports: [SubscribeService],
})
export class SubscribeModule {}
