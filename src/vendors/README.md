# `src/vendors/`

Thin wrappers around third-party SDKs. Each subdirectory is a Nest module that owns the auth + retry + error-mapping for one vendor.

- `aws/` — S3, SSM, Route53 (etc.)
- `braintrust/` — LLM eval logging
- `clerk/` — Clerk auth (also see `ClerkM2MAuthGuard`)
- `contentful/` — CMS content
- `ecanvasserIntegration/` — Ecanvasser CRM
- `forwardEmail/` — domain email forwarding
- `google/` — Maps, OAuth, Sheets
- `peerly/` — SMS sending
- `segment/` — analytics
- `slack/` — bot + alerts
- `stripe/` — billing
- `vercel/` — site deploys

Convention: vendor calls happen in services here. Application code injects the vendor service rather than calling the SDK directly. Wrap external calls in try/catch and throw `BadGatewayException` on failure.
