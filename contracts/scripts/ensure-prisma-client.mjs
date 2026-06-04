// Ensures the repo-root Prisma client (custom `output = src/generated/prisma`)
// exists before generate-enums imports it. The repo-root build orchestrator
// (scripts/build-contracts.ts) already runs `prisma generate` first, so this is
// a no-op in normal/CI builds. It only kicks in when the contracts package is
// built/published in isolation (e.g. `cd contracts && npm publish` triggering
// prepublishOnly) where the client may not have been generated yet.
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const contractsDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const clientDir = join(contractsDir, '..', 'src', 'generated', 'prisma')
// Check the sentinel entrypoint Node must resolve for the import to succeed,
// not just the directory — an interrupted `prisma generate` can leave an
// existing-but-incomplete dir that would still throw MODULE_NOT_FOUND.
const clientEntry = join(clientDir, 'index.js')

if (existsSync(clientEntry)) {
  process.exit(0)
}

console.log('[contracts] Prisma client not found; running `prisma generate`...')
execSync('npx prisma generate --schema=../prisma/schema', {
  cwd: contractsDir,
  stdio: 'inherit',
})
