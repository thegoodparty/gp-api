# `src/scheduled-messaging/`

Schedules outgoing messages (currently SMS via Peerly, email via Mailgun) for future delivery.

`scheduled-messaging.service.ts` exposes the public API. Reads pending messages from the DB on a `@nestjs/schedule` cron and dispatches them. Failures retry on the next tick — no exponential backoff today.
