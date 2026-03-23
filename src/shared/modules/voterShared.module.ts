import { Module } from '@nestjs/common'
import { HttpModule } from '@nestjs/axios'
import { VoterDatabaseService } from '../../voters/services/voterDatabase.service'
import { SlackModule } from 'src/vendors/slack/slack.module'

/**
 * Shared voter services module to break circular dependencies between voters and peerly modules.
 *
 * This module provides core voter database functionality that can be imported by multiple modules
 * without creating circular dependencies.
 */
@Module({
  imports: [HttpModule, SlackModule],
  providers: [VoterDatabaseService],
  exports: [VoterDatabaseService],
})
export class VoterSharedModule {}
