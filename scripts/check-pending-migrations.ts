import { execSync } from 'child_process'

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
