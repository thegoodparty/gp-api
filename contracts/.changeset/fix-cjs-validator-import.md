---
"@goodparty_org/contracts": patch
---

Use default imports for CJS-only `validator` package to fix ESM interop in consumer test runners

- Switch `import { isMobilePhone } from 'validator'` to `import validator from 'validator'` in PhoneSchema
- Switch `import { isPostalCode } from 'validator'` to `import validator from 'validator'` in ZipSchema
- Add const enum objects for campaign enums (CampaignCreatedBy, OnboardingStep, etc.) with declaration merging
- Add CampaignStatus enum to contracts
- Export campaign enums as both type and value from contracts index
- Fix CI change detection to compare full PR diff against base branch
- Update RC version naming to include PR number or branch name
