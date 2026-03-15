import { Module } from '@nestjs/common'
import { AUTH_PROVIDER_TOKEN } from '@/authentication/interfaces/auth-provider.interface'
import { ClerkClientProvider } from '@/vendors/clerk/providers/clerk-client.provider'
import { ClerkAuthService } from '@/vendors/clerk/services/clerk-auth.service'
import { ClerkWebhookService } from '@/vendors/clerk/services/clerk-webhook.service'
import { ClerkWebhookController } from '@/vendors/clerk/webhooks/clerk-webhook.controller'

@Module({
  providers: [
    ClerkClientProvider,
    {
      provide: AUTH_PROVIDER_TOKEN,
      useClass: ClerkAuthService,
    },
    ClerkWebhookService,
  ],
  exports: [AUTH_PROVIDER_TOKEN, ClerkWebhookService],
  controllers: [ClerkWebhookController],
})
export class ClerkModule {}
