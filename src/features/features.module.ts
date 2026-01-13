import { Global, Module } from '@nestjs/common'
import { UsersModule } from 'src/users/users.module'
import { FeaturesService } from './services/features.service'

@Global()
@Module({
  providers: [FeaturesService],
  exports: [FeaturesService],
  imports: [UsersModule],
})
export class FeaturesModule {}
