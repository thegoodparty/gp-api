# @goodparty_org/contracts

## 0.2.0

### Minor Changes

- Add SetDistrictOutput response schema and type for campaign district update endpoint

## 0.1.0

### Minor Changes

- Add Campaigns module schemas, UpdateUserInput schema, PaginationOptions schema, and CI path-based publish guard.
  - Add Campaign Zod schema, ReadCampaignOutput, ListCampaignsPagination, UpdateCampaignM2M schemas
  - Add non-Prisma campaign enums (BallotReadyPositionLevel, ElectionLevel, CampaignLaunchStatus, etc.)
  - Add Campaign JSON column types (CampaignDetails, CampaignData, CampaignAiContent and sub-types)
  - Add UpdateUserInput schema derived from CreateUserInput
  - Add UserMetaData inferred type export
  - Add PaginationOptions schema for generic sortable pagination
  - Generate Campaign scalar fields from Prisma DMMF for sort key derivation
  - Guard RC and stable publish steps with dorny/paths-filter to only publish when contracts source files change
  - Delete redundant gp-api wrapper schema files that only re-exported from contracts
  - Wire all gp-api consumers to import directly from @goodparty_org/contracts

- Add Ecanvasser module Zod schemas, inferred types, and SurveyStatus enum.
  - Add CreateEcanvasserInput and UpdateEcanvasserInput schemas
  - Add CreateSurveyInput and UpdateSurveyInput schemas with SurveyStatus enum
  - Add CreateSurveyQuestionInput and UpdateSurveyQuestionInput schemas
  - Add SurveyStatus enum (`Live`, `Not Live`) and SurveyStatusSchema

- Add Ecanvasser achemas and types.
  - Add Ecanvasser and EcanvasserSummary response types

- Initial release of shared contracts package. Extracts Zod schemas and inferred TypeScript types from gp-api for consumption by gp-sdk and other projects.

  Includes:
  - Prisma DMMF enum codegen (all 16 enums)
  - Shared schemas: Email, Phone, Zip, Password, Roles, Pagination
  - Users module schemas: CreateUserInput, ReadUserOutput, UserMetaData, UpdatePassword, ListUsersPagination
  - ZodResponseInterceptor for runtime response validation in gp-api controllers

### Patch Changes

- Use default imports for CJS-only `validator` package to fix ESM interop in consumer test runners
  - Switch `import { isMobilePhone } from 'validator'` to `import validator from 'validator'` in PhoneSchema
  - Switch `import { isPostalCode } from 'validator'` to `import validator from 'validator'` in ZipSchema
  - Add const enum objects for campaign enums (CampaignCreatedBy, OnboardingStep, etc.) with declaration merging
  - Add CampaignStatus enum to contracts
  - Export campaign enums as both type and value from contracts index
  - Fix CI change detection to compare full PR diff against base branch
  - Update RC version naming to include PR number or branch name

- Add RC publish workflow and OIDC Trusted Publisher support for automated npm publishing.
  - Non-master builds (PRs, develop, qa) publish RC versions via `changeset version --snapshot rc` + `changeset publish --tag rc`
  - Master builds publish stable versions via `changesets/action`
  - RC publish is guarded: only runs when changeset files are present (contracts actually changed)
  - PR builds get a comment with the published RC version and install command
  - Uses npm OIDC Trusted Publishing (no NPM_TOKEN needed), matching the gp-sdk pattern
  - Added `registry-url` to `setup-node` for OIDC auth
