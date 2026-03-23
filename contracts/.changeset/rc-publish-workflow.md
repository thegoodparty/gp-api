---
"@goodparty_org/contracts": patch
---

Add RC publish workflow and OIDC Trusted Publisher support for automated npm publishing.

- Non-master builds (PRs, develop, qa) publish RC versions via `changeset version --snapshot rc` + `changeset publish --tag rc`
- Master builds publish stable versions via `changesets/action`
- RC publish is guarded: only runs when changeset files are present (contracts actually changed)
- PR builds get a comment with the published RC version and install command
- Uses npm OIDC Trusted Publishing (no NPM_TOKEN needed), matching the gp-sdk pattern
- Added `registry-url` to `setup-node` for OIDC auth
