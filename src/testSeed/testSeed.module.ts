import { Module } from '@nestjs/common'
import { TestSeedController } from './testSeed.controller'
import { TestSeedService } from './testSeed.service'

@Module({
  controllers: [TestSeedController],
  providers: [TestSeedService],
})
export class TestSeedModule {}
