import { Module } from '@nestjs/common'
import { AUTH_PROVIDER_TOKEN } from '@/authentication/interfaces/auth-provider.interface'
import {
  CLERK_CLIENT_PROVIDER_TOKEN,
  ClerkClientProvider,
} from '@/vendors/clerk/providers/clerk-client.provider'
import { ClerkAuthService } from '@/vendors/clerk/services/clerk-auth.service'
import { ClerkUserEnricherService } from '@/vendors/clerk/services/clerk-user-enricher.service'

@Module({
  providers: [
    ClerkClientProvider,
    {
      provide: AUTH_PROVIDER_TOKEN,
      useClass: ClerkAuthService,
    },
    ClerkUserEnricherService,
  ],
  exports: [
    AUTH_PROVIDER_TOKEN,
    ClerkUserEnricherService,
    CLERK_CLIENT_PROVIDER_TOKEN,
  ],
})
export class ClerkModule {}
