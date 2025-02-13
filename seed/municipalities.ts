import { MunicipalityType, PrismaClient } from '@prisma/client'
import path from 'path'
import { loadCSV } from './util/csv.util'
import slugify from 'slugify'

type ExpectedCSVRow = {
  city: string
  state_id: string
  county_name: string
  township: string
  incorporated: string
}

let count = 0

export default async function seedMunicipalities(
  prisma: PrismaClient,
  loadAll = false,
  partNumber?: number,
) {
  const csvFilePath = loadAll
    ? path.join(
        __dirname,
        `./data/geoPoliticalEntities/dec23/cities/uscities_v1.77.csv`,
      )
    : partNumber
      ? path.join(
          __dirname,
          `./data/geoPoliticalEntities/dec23/cities/cities_part${partNumber}.csv`,
        )
      : path.join(
          __dirname,
          './data/geoPoliticalEntities/dec23/uscities_v1.77_short.csv',
        )

  console.log('Reading Municipalities from csv')

  const rows = await loadCSV<ExpectedCSVRow>(csvFilePath, 1000)

  const total = rows.length
  for (let i = 0; i < total; i++) {
    const percentComplete = (((i + 1) / total) * 100).toFixed(0)
    process.stdout.write(`\r ${i + 1}/${total} ${percentComplete}% complete`)
    await insertCityIntoDatabase(prisma, rows[i])
    count++
  }
  console.log(`\ninserted ${count} cities`)
}

async function insertCityIntoDatabase(
  prisma: PrismaClient,
  row: ExpectedCSVRow,
) {
  const { township, incorporated } = row

  let type = 'city'
  if (township === 'TRUE') {
    type = 'township'
  } else if (incorporated === 'FALSE') {
    type = 'town'
  }

  const county = await upsertCounty(prisma, row)
  if (county) {
    await upsertCity(prisma, row, type, county.id)
  }
}

async function upsertCity(
  prisma: PrismaClient,
  row: ExpectedCSVRow,
  type: string,
  countyId: number,
) {
  const { city, state_id, county_name } = row

  const slug = `${slugify(state_id, {
    lower: true,
  })}/${slugify(county_name, {
    lower: true,
  })}/${slugify(city, {
    lower: true,
  })}`

  return await prisma.municipality.upsert({
    where: {
      type: type as MunicipalityType,
      slug,
    },
    update: {},
    create: {
      name: city,
      type: type as MunicipalityType,
      state: state_id,
      countyId: countyId,
      data: row,
      slug,
    },
  })
}

async function upsertCounty(prisma: PrismaClient, row: ExpectedCSVRow) {
  const { county_name, state_id } = row

  const slug = `${slugify(state_id, {
    lower: true,
  })}/${slugify(county_name, {
    lower: true,
  })}`

  return await prisma.county.upsert({
    where: {
      slug,
    },
    update: {},
    create: {
      slug,
      name: county_name,
      state: state_id,
      data: row,
    },
  })
}
