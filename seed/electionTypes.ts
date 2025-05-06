import { PrismaClient } from '@prisma/client'
import path from 'path'
import { loadCSV } from './util/csv.util'

type ExpectedCSVRow = {
  name: string
  state: string
  category: string
}

let count = 0
export default async function seedElectionTypes(prisma: PrismaClient) {
  const csvFilePath = path.join(__dirname, './data/electiontype.csv')

  console.log('Reading Election Types from csv')

  const rows = await loadCSV<ExpectedCSVRow>(csvFilePath, 1000)
  const total = rows.length

  for (let i = 0; i < total; i++) {
    const row = rows[i]
    const percentComplete = (((i + 1) / total) * 100).toFixed(0)
    process.stdout.write(`\r ${i + 1}/${total} ${percentComplete}% complete`)

    await prisma.electionType.upsert({
      where: {
        name_state_category: {
          name: row.name,
          state: row.state,
          category: row.category,
        },
      },
      create: row,
      update: {},
    })

    count++
  }

  console.log(`\ninserted ${count} election types.`)
}
