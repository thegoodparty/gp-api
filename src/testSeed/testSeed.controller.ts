import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UsePipes,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { ZodValidationPipe } from 'nestjs-zod'
import { ReqUser } from '@/authentication/decorators/ReqUser.decorator'
import { TestSeedService } from './testSeed.service'
import { SeedCampaignSchema } from './schemas/seedCampaign.schema'

/**
 * Test-only controller for seeding campaign data.
 * Entire module is conditionally loaded when PEERLY_TEST_IDENTITY_ID is set.
 */
@Controller('test/seed')
@UsePipes(ZodValidationPipe)
export class TestSeedController {
  constructor(private readonly testSeed: TestSeedService) {}

  @Post('campaign')
  @HttpCode(HttpStatus.OK)
  seedCampaign(@ReqUser() user: User, @Body() body: SeedCampaignSchema) {
    return this.testSeed.seedCampaign(user.id, body)
  }
}
