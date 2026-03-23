---
"@goodparty_org/contracts": minor
---

Initial release of shared contracts package. Extracts Zod schemas and inferred TypeScript types from gp-api for consumption by gp-sdk and other projects.

Includes:
- Prisma DMMF enum codegen (all 16 enums)
- Shared schemas: Email, Phone, Zip, Password, Roles, Pagination
- Users module schemas: CreateUserInput, ReadUserOutput, UserMetaData, UpdatePassword, ListUsersPagination
- ZodResponseInterceptor for runtime response validation in gp-api controllers
