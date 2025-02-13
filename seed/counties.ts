import { PrismaClient } from '@prisma/client'
import slugify from 'slugify'
import path from 'path'
import { loadCSV } from './util/csv.util'

type ExpectedCSVRow = {
  county: string
  state_id: string
}

let count = 0
export default async function seedCounties(
  prisma: PrismaClient,
  loadAll = false,
) {
  const csvFilePath = loadAll // use full dataset for prod/qa, short dataset for dev
    ? path.join(
        __dirname,
        './data/geoPoliticalEntities/dec23/uscounties_v1.73.csv',
      )
    : path.join(
        __dirname,
        './data/geoPoliticalEntities/dec23/uscounties_v1.73_short.csv',
      )

  console.log('Reading Counties from csv')

  const rows = await loadCSV<ExpectedCSVRow>(csvFilePath)

  const total = rows.length
  for (let i = 0; i < total; i++) {
    const percentComplete = (((i + 1) / total) * 100).toFixed(0)
    process.stdout.write(`\r ${i + 1}/${total} ${percentComplete}% complete`)

    const row = rows[i]
    const { county, state_id } = row

    await upsertCounty(prisma, county, state_id, row)
    count++
  }
  console.log(`\ninserted ${count} counties`)
}

export async function upsertCounty(
  prisma: PrismaClient,
  county: string,
  state: string,
  row: object,
) {
  const slug = `${slugify(state, {
    lower: true,
  })}/${slugify(county, {
    lower: true,
  })}`

  return await prisma.county.upsert({
    where: {
      slug,
    },
    update: {},
    create: {
      slug,
      name: county,
      state: state,
      data: row,
    },
  })
}
