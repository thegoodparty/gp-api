import { PrismaClient } from '@prisma/client'
import { websiteContactFactory } from './factories/websiteContact.factory'

const NUM_CONTACTS_PER_WEBSITE = 100

export default async function seedWebsiteContacts(prisma: PrismaClient) {
  const websites = await prisma.website.findMany({ select: { id: true } })
  let totalContacts = 0

  for (const website of websites) {
    const contacts = Array.from({ length: NUM_CONTACTS_PER_WEBSITE }, () =>
      websiteContactFactory({ websiteId: website.id }),
    )
    await prisma.websiteContact.createMany({ data: contacts })
    totalContacts += contacts.length
    console.log(`Created ${contacts.length} contacts for website ${website.id}`)
  }

  console.log(`Created ${totalContacts} website contacts in total`)
  return totalContacts
}
