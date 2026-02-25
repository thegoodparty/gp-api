import { statSync, existsSync } from 'fs'
import { execSync } from 'child_process'
import { join } from 'path'

const root = join(__dirname, '..')
const dist = join(root, 'contracts/dist/index.js')
const srcDir = join(root, 'contracts/src')
const scriptsDir = join(root, 'contracts/scripts')

const isUpToDate = (): boolean => {
  if (!existsSync(dist)) return false

  const distMtime = statSync(dist).mtimeMs
  const newerSrc = execSync(
    `find ${srcDir} ${scriptsDir} -name "*.ts" -newer ${dist}`,
    { encoding: 'utf8' },
  ).trim()

  return newerSrc.length === 0
}

if (isUpToDate()) {
  console.log('contracts: up to date, skipping build')
  process.exit(0)
}

execSync('npm run generate && cd contracts && npm run build', {
  stdio: 'inherit',
  cwd: root,
})
