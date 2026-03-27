import { Module } from '@nestjs/common'
import { AUTH_PROVIDER_TOKEN } from '@/authentication/interfaces/auth-provider.interface'
import { ClerkClientProvider } from '@/vendors/clerk/providers/clerk-client.provider'
import { ClerkAuthService } from '@/vendors/clerk/services/clerk-auth.service'
import { ClerkEventsHandlerService } from '@/vendors/clerk/services/clerk-events-handler.service'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'
import { ClerkEventsHandlerController } from '@/vendors/clerk/webhooks/clerk-events-handler.controller'

@Module({
  providers: [
    ClerkClientProvider,
    {
      provide: AUTH_PROVIDER_TOKEN,
      useClass: ClerkAuthService,
    },
    ClerkEventsHandlerService,
    ClerkUserEnricherService,
  ],
  exports: [
    AUTH_PROVIDER_TOKEN,
    ClerkEventsHandlerService,
    ClerkUserEnricherService,
  ],
  controllers: [ClerkEventsHandlerController],
})
export class ClerkModule {}
