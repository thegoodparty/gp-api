import { Global, Module } from '@nestjs/common'
import { FeaturesService } from './features.service'
import { UsersModule } from 'src/users/users.module'

@Global()
@Module({
  providers: [FeaturesService],
  exports: [FeaturesService],
  imports: [UsersModule],
})
export class FeaturesModule {}
