# Websites Module

Backend for campaign websites — public-facing static sites generated per campaign with optional custom domains, contact-form intake, and view tracking. Vercel hosts the rendered output; this module owns the database side and the domain-registration flow through Route 53.

A longer narrative lives in `README.md` (data model, endpoint catalogue). This file is the navigation pointer.

## Key files

| Path                                  | Purpose                                                                                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `websites.module.ts`                  | Wires controllers + services; depends on `VercelModule`, `AwsModule`, `PaymentsModule`, `ForwardEmailModule` |
| `controllers/websites.controller.ts`  | CRUD on `Website`, contact form submission, view tracking                                                    |
| `controllers/domains.controller.ts`   | Custom domain registration, status polling, suggestions                                                      |
| `services/websites.service.ts`        | Website CRUD, default content generation, publish/unpublish                                                  |
| `services/domains.service.ts`         | Route 53 + Vercel domain orchestration                                                                       |
| `services/websiteContacts.service.ts` | Inbound contact form persistence                                                                             |
| `services/websiteViews.service.ts`    | UUID-keyed visitor view counter                                                                              |
| `schemas/`                            | Zod schemas for create/update website, contact form, list filters                                            |
| `domains.types.ts`                    | `DomainRegistrationStatus`, payload shapes                                                                   |
| `README.md`                           | DB models + endpoint reference                                                                               |

## Patterns

- **Domain registration is a multi-step async flow** (Stripe charge → Route 53 op → polling → Vercel attach). State lives on the `Domain` row; never short-circuit by reading from Route 53 ad hoc.
- **Forward Email is the inbound mail provider** for custom-domain campaign emails. New email-related domain features go through `ForwardEmailModule`, not direct DNS edits.
- Website creation auto-seeds content from the campaign's positions and user data — see `WebsitesService.createForCampaign`.
- `WebsitesModule` has a non-trivial constructor that wires `PurchaseService` for the domain purchase flow — uncommon for a Nest module class; if you're adding logic here, prefer pushing it into a service.

## Gotchas

- `forwardRef(() => CampaignsModule)` — circular with campaigns. Keep new edges to the campaigns side as forwardRefs to avoid breaking module init.
- `WebsiteView` uses a localStorage-issued visitor UUID; treat it as advisory, not authoritative analytics.
- Public-facing endpoints use `@PublicAccess()` and `@UseCampaign()` together — don't drop one when refactoring or you'll either expose admin data or 401 the public site.
- Contact form submissions are write-only from the public site; the admin-side read goes through a separate authenticated endpoint with `GetWebsiteContactsSchema`.
