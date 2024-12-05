import { PrismaClient } from '@prisma/client'
import slugify from 'slugify'

export function buildSlug(name: string, suffix?: string) {
  return `${slugify(`${name}`, { lower: true })}${suffix ? `-${suffix}` : ''}`
}

const MAX_TRIES = 100

export async function findSlug(
  prismaClient: PrismaClient,
  name: string,
  suffix?: string,
) {
  const slug = buildSlug(name, suffix)
  const exists = await prismaClient.campaign.findUnique({ where: { slug } })
  if (!exists) {
    return slug
  }

  for (let i = 1; i < MAX_TRIES; i++) {
    const slug = buildSlug(`${name}${i}`, suffix)
    const exists = await prismaClient.campaign.findUnique({ where: { slug } })
    if (!exists) {
      return slug
    }
  }

  return slug as never // should not happen
}
