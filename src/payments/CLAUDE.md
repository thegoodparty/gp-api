# Payments Module

Stripe-backed payments. Two controllers, both mounted under `/payments`:

- `payments.controller.ts` — `POST /payments/events` (Stripe webhook receiver) and `PATCH /payments/fix-missing-customer-id` (admin maintenance).
- `purchase.controller.ts` — checkout flows under `/payments/purchase/*`: create/complete Stripe Custom Checkout sessions, billing-portal redirects, and free-purchase fast paths. This is the entry point external callers (websites, outreach, polls) use.

`PurchaseService` orchestrates a typed purchase → checkout session → fulfillment flow. `PaymentsService` is a thinner Stripe wrapper used internally; rarely the right place to start.

## Key files

| Path                               | Purpose                                                                                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `payments.module.ts`               | Wires controllers + services; `forwardRef(() => CampaignsModule)`, depends on `StripeModule`, `UsersModule`                                    |
| `payments.controller.ts`           | Stripe webhook + admin `fix-missing-customer-id` endpoint                                                                                      |
| `purchase.controller.ts`           | `POST /payments/purchase/checkout-session`, `portal-session`, `create-checkout-session`, `complete-checkout-session`, `complete-free-purchase` |
| `services/payments.service.ts`     | `createPayment`/`retrievePayment` over Stripe PaymentIntents; customer-id backfill (`@Timeout(0)` on boot + admin endpoint)                    |
| `services/purchase.service.ts`     | Per-`PurchaseType` validation, amount calc, post-purchase handlers                                                                             |
| `services/paymentEventsService.ts` | Stripe webhook event dispatcher (subscriptions, invoices, charges)                                                                             |
| `payments.types.ts`                | `PaymentType`, `PaymentIntentPayload<T>`                                                                                                       |
| `purchase.types.ts`                | `PurchaseType` enum (`DOMAIN_REGISTRATION`, `TEXT`, `POLL`) and per-type DTOs                                                                  |

Filename note: `paymentEventsService.ts` intentionally lacks the `.service` suffix — historical, leave it.

## Patterns

- **Stripe webhook events flow through `PaymentEventsService`**, not the controllers. To react to a new event type, add the handler there — that's where business effects fire.
- **`PurchaseType` is the typed extension point.** Adding a new purchase kind: add to the enum, add a metadata type, register a `PurchaseHandler<Metadata>` (`validatePurchase` / `calculateAmount` / optional `getProductName` / `getProductDescription`) in `PurchaseService`. Don't add ad-hoc payment paths outside this module.
- **External calls are wrapped in try/catch and throw `BadGatewayException`** (`.cursor/rules/rules.mdc` Rule 3). DB writes are not wrapped — let `PrismaExceptionFilter` handle them.
- `forwardRef(() => CampaignsModule)` because purchase fulfillment touches campaign state.

## Gotchas

- Stripe webhooks must be idempotent — events can replay. Preserve dedupe in `PaymentEventsService` when adding handlers.
- The webhook route is `@PublicAccess()` and verifies the `stripe-signature` header — never bypass that check.
- `PaymentsService.backfillMissingCustomerIdsOnBoot` runs at startup via `@Timeout(0)`. Be mindful of side effects when adding work to `PaymentsService` constructor or boot path.
- Test fixtures use Stripe test-mode IDs prefixed `pi_test_…`. Don't compare against literal IDs in assertions; assert on side effects (DB row, user metadata) instead.
