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
