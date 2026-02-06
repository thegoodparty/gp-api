import { execSync } from 'child_process'
import fs from 'fs'

const schema = 'prisma/schema/schema.prisma'
const generated = 'node_modules/.prisma/client'

const needsGenerate =
  !fs.existsSync(generated) ||
  fs.statSync(schema).mtime > fs.statSync(generated).mtime

if (needsGenerate) {
  console.log('Prisma schema changed, generating client...')
  execSync('prisma generate', { stdio: 'inherit' })
} else {
  console.log('Prisma client up to date, skipping generate.')
}

// Check for pending migrations (requires DB connection)
try {
  execSync('prisma migrate status', { stdio: 'pipe' })
} catch (error) {
  // Exit code 1 = pending migrations, check stdout for confirmation
  const output = (error as { stdout?: Buffer })?.stdout?.toString() ?? ''
  if (output.includes('not yet been applied')) {
    const yellow = '\x1b[33m'
    const red = '\x1b[31m'
    const bold = '\x1b[1m'
    const reset = '\x1b[0m'
    console.log(`
${yellow}╔════════════════════════════════════════════════════════════════╗
║  ${red}${bold}⚠️  WARNING: PENDING DATABASE MIGRATIONS DETECTED ⚠️${reset}${yellow}          ║
║                                                                ║
║  Your database schema is out of sync!                          ║
║                                                                ║
║  Run: ${bold}npm run migrate:dev${reset}${yellow}                                      ║
╚════════════════════════════════════════════════════════════════╝${reset}
`)
  }
  // Otherwise: DB not available or other error - silently skip
}
