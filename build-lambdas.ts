import { execSync } from 'child_process'
import { globSync } from 'fast-glob'
import AdmZip = require('adm-zip')

execSync(
  "esbuild 'src/lambdas/*.ts' --bundle --platform=node --target=node22 --outdir=dist/lambdas --external:dtrace-provider",
)

const tmp = globSync('src/lambdas/*.ts')

for (const filepath of tmp) {
  const filename = filepath.split('/').pop()?.replace('.ts', '')
  const zip = new AdmZip()
  zip.addLocalFile(`dist/lambdas/${filename}.js`, undefined, 'index.js')
  zip.writeZip(`dist/lambdas/${filename}.zip`)
}
