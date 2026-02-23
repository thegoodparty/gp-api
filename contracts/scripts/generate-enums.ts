import { Prisma } from '@prisma/client'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const outputDir = join(__dirname, '..', 'src', 'generated')
const outputPath = join(outputDir, 'enums.ts')

const toConstName = (enumName: string): string => {
  const words = enumName.replace(/([a-z])([A-Z])/g, '$1_$2')
  return `${words.toUpperCase()}_VALUES`
}

const toSchemaName = (enumName: string): string => `${enumName}Schema`

const lines: string[] = [
  "import { z } from 'zod'",
  '',
]

const { enums } = Prisma.dmmf.datamodel

for (const prismaEnum of enums) {
  const { name, values } = prismaEnum
  const constName = toConstName(name)
  const valueNames = values.map((v) => v.name)
  const valuesLiteral = valueNames.map((v) => `'${v}'`).join(', ')

  lines.push(`export const ${constName} = [${valuesLiteral}] as const`)
  lines.push(`export type ${name} = (typeof ${constName})[number]`)
  lines.push(`export const ${toSchemaName(name)} = z.enum(${constName})`)
  lines.push('')
}

mkdirSync(outputDir, { recursive: true })
writeFileSync(outputPath, lines.join('\n'), 'utf-8')

console.log(`Generated ${enums.length} enums -> ${outputPath}`)
