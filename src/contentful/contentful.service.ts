import {
  createClient,
  DeletedEntry,
  Entry,
  EntryCollection,
  EntrySkeletonType,
} from 'contentful'
import { Injectable } from '@nestjs/common'

const { CONTENTFUL_SPACE_ID, CONTENTFUL_ACCESS_TOKEN } = process.env as Record<
  string,
  string
>

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
    nextSyncToken = newToken as string

    const allEntries = await this.getAllEntries()

    return {
      allEntries: allEntries,
      deletedEntries,
    }
  }
}
