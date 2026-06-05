import { getDMMF, getSchemaWithPath } from '@prisma/internals'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

// Read the datamodel straight from the Prisma schema source rather than a
// generated runtime `@prisma/client`. This keeps enum generation independent
// of `prisma generate` (and of where the client is emitted), so it works
// before the client exists and after the client moves to a custom output dir.
const schemaPath =
  process.env.PRISMA_SCHEMA_PATH ?? join(__dirname, '..', '..', 'prisma', 'schema')

const outputDir = join(__dirname, '..', 'src', 'generated')
const enumsOutputPath = join(outputDir, 'enums.ts')
const scalarFieldsOutputPath = join(outputDir, 'scalarFields.ts')

const toConstName = (enumName: string): string => {
  const words = enumName.replace(/([a-z])([A-Z])/g, '$1_$2')
  return `${words.toUpperCase()}_VALUES`
}

const toSchemaName = (enumName: string): string => `${enumName}Schema`

const SCALAR_FIELD_MODELS = ['User', 'Campaign']

async function main(): Promise<void> {
  const { schemas } = await getSchemaWithPath(schemaPath)
  const { datamodel } = await getDMMF({ datamodel: schemas })
  const { enums, models } = datamodel

  const enumLines: string[] = ["import { z } from 'zod'", '']

  for (const prismaEnum of enums) {
    const { name, values } = prismaEnum
    const constName = toConstName(name)
    const valueNames = values.map((v) => v.name)
    const valuesLiteral = valueNames.map((v) => `'${v}'`).join(', ')

    enumLines.push(`export const ${constName} = [${valuesLiteral}] as const`)
    enumLines.push(`export type ${name} = (typeof ${constName})[number]`)
    enumLines.push(`export const ${toSchemaName(name)} = z.enum(${constName})`)
    enumLines.push('')
  }

  const scalarFieldLines: string[] = []

  for (const modelName of SCALAR_FIELD_MODELS) {
    const model = models.find((m) => m.name === modelName)
    if (!model) {
      console.warn(`Model ${modelName} not found in Prisma DMMF, skipping scalar fields`)
      continue
    }

    const scalarFields = model.fields
      .filter((f) => f.kind === 'scalar' || f.kind === 'enum')
      .map((f) => f.name)
    const constName = `${modelName.toUpperCase()}_SCALAR_FIELDS`
    const valuesLiteral = scalarFields.map((v) => `'${v}'`).join(', ')

    scalarFieldLines.push(`export const ${constName} = [${valuesLiteral}] as const`)
    scalarFieldLines.push('')
  }

  mkdirSync(outputDir, { recursive: true })
  writeFileSync(enumsOutputPath, enumLines.join('\n'), 'utf-8')
  writeFileSync(scalarFieldsOutputPath, scalarFieldLines.join('\n'), 'utf-8')

  console.log(`Generated ${enums.length} enums -> ${enumsOutputPath}`)
  console.log(
    `Generated scalar fields for ${SCALAR_FIELD_MODELS.length} model(s) -> ${scalarFieldsOutputPath}`,
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
