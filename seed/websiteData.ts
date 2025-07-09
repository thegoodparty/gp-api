import { PrismaClient } from '@prisma/client'
import { websiteContactFactory } from './factories/websiteContact.factory'
import { websiteViewFactory } from './factories/websiteView.factory'

const NUM_CONTACTS_PER_WEBSITE = 100
const NUM_VIEWS_PER_WEBSITE = 1000

export default async function seedWebsiteData(prisma: PrismaClient) {
  const websites = await prisma.website.findMany({ select: { id: true } })
  let totalContacts = 0
  let totalViews = 0

  for (const website of websites) {
    const contacts = Array.from({ length: NUM_CONTACTS_PER_WEBSITE }, () =>
      websiteContactFactory({ websiteId: website.id }),
    )
    await prisma.websiteContact.createMany({ data: contacts })
    totalContacts += contacts.length
    console.log(`Created ${contacts.length} contacts for website ${website.id}`)

    const views = Array.from({ length: NUM_VIEWS_PER_WEBSITE }, () =>
      websiteViewFactory({ websiteId: website.id }),
    )
    await prisma.websiteView.createMany({ data: views })
    totalViews += views.length
    console.log(`Created ${views.length} views for website ${website.id}`)
  }

  console.log(`Created ${totalContacts} website contacts in total`)
  console.log(`Created ${totalViews} website views in total`)
  return { totalContacts, totalViews }
}
