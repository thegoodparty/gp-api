import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'
import { SlackModule } from 'src/vendors/slack/slack.module'
import { VoterDatabaseService } from '../../voters/services/voterDatabase.service'

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
