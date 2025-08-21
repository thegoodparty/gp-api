import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { VoterDatabaseService } from '../../voters/services/voterDatabase.service'
import { SlackService } from '../services/slack.service'

/**
 * Shared voter services module to break circular dependencies between voters and peerly modules.
 *
 * This module provides core voter database functionality that can be imported by multiple modules
 * without creating circular dependencies.
 */
@Module({
  imports: [HttpModule],
  providers: [VoterDatabaseService, SlackService],
  exports: [VoterDatabaseService],
})
export class VoterSharedModule {}
