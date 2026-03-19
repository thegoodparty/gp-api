/**
 * Slim NestJS module for backfill scripts.
 *
 * AppModule registers HTTP-specific providers (APP_GUARD, APP_INTERCEPTOR)
 * that fail inside `createApplicationContext` (no HTTP server).
 *
 * This module imports only what OrganizationsBackfillService actually needs,
 * avoiding the massive CampaignsModule dependency tree. ElectionsModule
 * normally imports CampaignsModule (which pulls in 15+ modules), but
 * ElectionsService itself only needs HttpService, SlackService, and PinoLogger.
 *
 * IMPORTANT: Scripts must import from `dist/` (not `src/`) because `tsx` uses
 * esbuild which does NOT support `emitDecoratorMetadata`. The SWC-compiled
 * `dist/` files have proper decorator metadata that NestJS DI requires.
 * Run `npx nest build` before using the backfill scripts.
 */
import { ElectionsService } from '../dist/elections/services/elections.service'
import { loggerModule } from '../dist/observability/logging/logger-module'
import { OrganizationsBackfillService } from '../dist/organizations/services/organizations-backfill.service'
import { OrganizationsService } from '../dist/organizations/services/organizations.service'
import { PrismaModule } from '../dist/prisma/prisma.module'
import { SlackModule } from '../dist/vendors/slack/slack.module'
import { HttpModule } from '@nestjs/axios'
import { Module } from '@nestjs/common'

/**
 * Minimal replacement for ElectionsModule — provides only ElectionsService
 * without importing CampaignsModule and its transitive dependency tree.
 */
@Module({
  imports: [HttpModule, SlackModule],
  providers: [ElectionsService],
  exports: [ElectionsService],
})
class BackfillElectionsModule {}

@Module({
  imports: [loggerModule, PrismaModule, BackfillElectionsModule],
  providers: [OrganizationsService, OrganizationsBackfillService],
})
export class BackfillModule {}
