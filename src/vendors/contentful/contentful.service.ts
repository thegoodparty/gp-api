import {
  createClient,
  DeletedEntry,
  Entry,
  EntryCollection,
  EntrySkeletonType,
} from 'contentful'
import { Injectable } from '@nestjs/common'

// process.env values are string | undefined — would need requireEnv() refactor
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const { CONTENTFUL_SPACE_ID, CONTENTFUL_ACCESS_TOKEN } = process.env as Record<
  string,
  string
>
if (!CONTENTFUL_SPACE_ID || !CONTENTFUL_ACCESS_TOKEN) {
  throw new Error(
    'Please set CONTENTFUL_SPACE_ID and CONTENTFUL_ACCESS_TOKEN in your .env',
  )
}
const contentfulClient = createClient({
  space: CONTENTFUL_SPACE_ID,
  accessToken: CONTENTFUL_ACCESS_TOKEN,
})

// TODO: Move this to a key/value store to persist across application instances
let nextSyncToken = ''

const LIMIT = 300
const CALLS = 8

@Injectable()
export class ContentfulService {
  async getAllEntries() {
    const allEntryCollections: EntryCollection<EntrySkeletonType>[] = []
    for (let i = 0; i < CALLS; i++) {
      const entryCollection = await contentfulClient.getEntries({
        limit: LIMIT,
        include: 10,
        skip: i * LIMIT,
      })
      allEntryCollections.push(entryCollection)
    }
    return allEntryCollections.reduce((acc, entryCollection) => {
      return [...acc, ...entryCollection.items]
    }, [] as Entry[])
  }

  async getSync(): Promise<{
    allEntries: Entry[]
    deletedEntries: DeletedEntry[]
  }> {
    const { deletedEntries, nextSyncToken: newToken } =
      await contentfulClient.sync({
        ...(!nextSyncToken ? { initial: true } : { nextSyncToken }),
      })
    // CMS content types use dynamic string keys — indexing by runtime key returns broad union
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    nextSyncToken = newToken as string

    return {
      allEntries: await this.getAllEntries(),
      deletedEntries,
    }
  }
}
